# Gymflow

Mini gym class booking SaaS with two AI layers on top: an overbooking advisor on the class side, and a **blood-panel driven weekly program** on the member side. Built as a focused "show" project for the Virtuagym B2B domain (class booking + credits + check-in), then extended with features the base product doesn't have.

Live demo: <https://jurowl.com>

## The idea

The core product is the boring part: members book classes, pay in credits, check in. The interesting part is the **+ layer**, which is now two features:

### + Overbooking advisor

- **Grok-powered advisor** reads the current class context (bookings, member cohort, recent attendance) and returns a strictly-shaped JSON answer validated by a Zod contract.
- **Smart overbooking**: if expected attendance leaves enough headroom, allow a booking past hard capacity instead of waitlisting.
- **Automatic waitlist promotion**: on cancellation, the head of the waitlist is charged and promoted atomically.
- **Decision audit log**: every advisor call is persisted with prompt, response, rationale, latency, and token usage.
- **Admin override**: flip the advisor off in one click and fall back to hard capacity.

### + Bloodwork-driven weekly program

- Members upload a **blood-test PDF** or enter values manually. Recognised markers are classified by a deterministic rule layer, then Grok writes a one-week gym plan around the bands.
- **Rules first, LLM second**: every marker's interpretation (LOW / BORDERLINE / NORMAL / HIGH) comes from a reference-range + 20% margin rule — not the model. Same input, same bucket, always.
- **Editable preview**: PDF extraction never saves anything directly — the user reviews and edits the pulled rows before confirming.
- **Tailored class browser**: the `/book` page decorates each class card with "Recommended for you" / "Go easy this week" badges based on the member's latest `recommendedCategories` / `avoidCategories`.
- **Inspired by BloodKnows**: the `rules → stratify → single focused LLM call → Zod-validate` pipeline is adapted from a real bloodwork product, collapsed to one LLM hop because the rule layer already does the marker-level work.

## Architecture

```
apps/
  web/   Next.js 15 App Router + Tailwind — admin & member UI
  api/   NestJS 10 + Prisma + Postgres + Grok — domain, booking, AI
packages/
  shared/  Zod schemas + types — the single source of truth for web ↔ api contracts
docker/
  docker-compose.yml       dev (Postgres only)
  docker-compose.prod.yml  full stack (compose-run api + web + db)
```

### API layout — feature-first, capped depth

```
apps/api/src/
  main.ts
  app.module.ts

  config/                 ← zod-validated env (boot fails fast on a bad secret)
    env.schema.ts
    env.service.ts
    config.module.ts

  core/                   ← infrastructure (DB, clock, HTTP clients)
    prisma/{prisma.module,prisma.service}.ts

  common/                 ← cross-cutting request concerns, no business logic
    filters/http-exception.filter.ts     ← global RFC 7807-ish errors
    pipes/zod-validation.pipe.ts         ← ZodSchema → NestPipe
    guards/{jwt-auth,roles}.guard.ts
    decorators/{public,roles,current-user,zod-body,zod-query}.ts
    middleware/request-id.middleware.ts   ← x-request-id propagation + log line

  modules/                ← every feature, self-contained
    auth/       {module, controller, service, repository, strategies/jwt.strategy}
    members/    {module, controller, service, repository}
    classes/    {module, controller, service, repository}
    trainers/   {module, controller, service, repository}
    bookings/   {module, controller, service, repository}
    ai/         {module, controller, grok-client, no-show-advisor, ai-decision.repository}
    bloodwork/  {module, controller, service, repository, classifier, analyzer, pdf-extractor}
    health/     {module, controller}       ← liveness ping, not the bloodwork feature
```

The root never grows past six entries (`main.ts`, `app.module.ts`, `config/`, `core/`, `common/`, `modules/`). Adding a new feature means one new folder under `modules/`, nothing else moves.

### Layering rules

1. **Controller** only parses input (via a shared Zod schema), calls a service, returns the result.
2. **Service** holds domain logic and orchestrates repositories. It never touches Prisma directly.
3. **Repository** is the only layer that speaks to Prisma. Methods accept an optional `Prisma.TransactionClient` so services can stitch them into a single `$transaction` without the repository owning the transaction.
4. **Cross-module calls** import through `@Module({ imports })`. No deep reach-in imports.

This makes testing painless: services are unit-tested with mocked repositories (see `auth.service.spec.ts`, `no-show-advisor.service.spec.ts`) without any Prisma fakes.

## Zod-driven contracts

`packages/shared` holds every request/response schema as a Zod object:

```ts
// packages/shared/src/schemas/ai.schema.ts
export const NoShowAdvisorResponseSchema = z.object({
  expectedAttendance: z.number().min(0),
  expectedNoShows: z.number().min(0),
  overbookRecommendation: z.enum(["ALLOW", "DENY"]),
  riskBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationale: z.string().min(1).max(600),
  perBooking: z.array(...),
});
export type NoShowAdvisorResponse = z.infer<typeof NoShowAdvisorResponseSchema>;
```

The same schema is used three ways:

- **API input validation** — controllers use `@ZodBody(Schema)` / `@ZodQuery(Schema)` decorators backed by `ZodValidationPipe`, which throws a structured 400 on bad payloads.
- **API output validation** — the Grok response is parsed with `Schema.parse()`, so a model hallucination never silently becomes a bad domain object.
- **Frontend form types** — web imports the same types, so an API rename is a compile error on the form.

## Data invariants live in the database

Booking / credit logic is safety-critical, so the authoritative checks live in Postgres:

- `CHECK (credits >= 0)` on `Member`, `CHECK ("remainingCredits" >= 0)` on `CreditPack`.
- `CHECK (capacity > 0)`, `CHECK ("durationMinutes" > 0)` on `Class`.
- **Partial unique index** on `Booking (classId, memberId)` filtered to live statuses — a member can't have two live rows on the same class, but can re-book after cancelling.
- `SELECT ... FOR UPDATE` on the class row before any capacity math.
- `SELECT ... FOR UPDATE SKIP LOCKED` when promoting the waitlist head, so two parallel cancellations don't promote the same member twice.

See `apps/api/prisma/migrations/20260423010000_credit_checks/migration.sql`.

## The AI advisor (xAI Grok)

```
bookings.service ─► no-show-advisor.service ─► grok-client.service ─► POST /chat/completions
                                  │
                                  ├─► prisma.class (read context)
                                  └─► ai-decision.repository (audit)
```

- `GrokClient` is a thin axios wrapper over xAI's OpenAI-compatible `/chat/completions`. Returns raw text + usage + latency.
- `NoShowAdvisor` is the domain layer: builds a compact JSON prompt from the class + live bookings + recent attendance, asks Grok for `response_format: json_object`, parses with `NoShowAdvisorResponseSchema`, records the decision, and returns an overbook verdict.
- `BookingsService.book` calls `advisor.shouldAllowOverbook` **outside** the transaction (HTTP should never hold row locks). The advisor's verdict is advisory; the authoritative capacity check still happens inside the tx.
- Admin can disable the advisor or move the overbook factor from the UI at any time.

## The bloodwork analyzer

```
POST /bloodwork/extract   (PDF → preview, nothing saved)
POST /bloodwork/reports   (confirm + persist + analyze)
GET  /bloodwork/reports/me           (list)
GET  /bloodwork/reports/me/latest    (latest)
GET  /bloodwork/reports/:id          (detail)
GET  /bloodwork/recommendations/me/latest
```

Pipeline (PDF path):

```
raw PDF ─► pdf-extractor ─► pdf-parse (text layer)
                          └► Grok (structure → marker rows)
                                │
                                ▼
                          editable preview (not persisted)
                                │
                       user confirms/edits
                                ▼
                      bloodwork.service
                       ├─► normaliseMarkers (drop anything outside catalog)
                       ├─► classifier.service  (rules, no LLM)  → bands
                       ├─► analyzer.service    (single Grok call) → program
                       └─► repository $transaction (report + markers + recommendation)
```

1. **Domain first, LLM second.** `classifier.service.ts` deterministically buckets every marker into LOW / BORDERLINE_LOW / NORMAL / BORDERLINE_HIGH / HIGH using the reference range and a 20% margin rule (same pattern BloodKnows uses). No LLM runs until this is done.
2. **PDF extraction is non-destructive.** `pdf-extractor.service.ts` pulls the text layer with `pdf-parse`, then asks Grok to structure it into catalog-mapped marker rows. Image-only PDFs are rejected with a clear error. The preview is **never saved** — it's returned to the UI as an editable table so the user can correct OCR mistakes before committing.
3. **Single-stage analyzer.** `analyzer.service.ts` makes one LLM call over already-classified markers. The model gets to write the program (categories recommended/avoided, weekly plan, warnings, per-marker qualitative explanation, readiness score 0–100) but is explicitly told to trust the interpretation bands and never quote raw numbers.
4. **Atomic persistence.** `bloodwork.service.ts` runs normalise → classify → analyze → `$transaction` persist, so you either get a complete report + markers + recommendation or nothing.

Contract enforced at parse time:

```ts
// packages/shared/src/schemas/health.schema.ts
export const ProgramRecommendationResponseSchema = z.object({
  readinessScore:         z.number().int().min(0).max(100),
  recommendedCategories:  z.array(ClassCategoryEnum).max(6),
  avoidCategories:        z.array(ClassCategoryEnum).max(6),
  perMarker: z.array(z.object({
    canonicalName:        z.string(),
    interpretation:       MarkerInterpretationEnum,
    explanation:          z.string().max(400),
    impact:               z.enum(["NONE","LOW","MEDIUM","HIGH"]),
    suggestedCategories:  z.array(ClassCategoryEnum),
    avoidCategories:      z.array(ClassCategoryEnum),
  })).max(30),
  weeklyPlan:             z.string().max(1200),
  warnings:               z.array(z.string().max(240)).max(8),
  summary:                z.string().max(800),
});
```

`ClassCategory` (shared enum): `HIIT`, `CARDIO`, `STRENGTH`, `YOGA`, `MOBILITY`, `PILATES`, `CYCLING`, `RECOVERY`. Every `Class` row carries one; the `/book` page matches it against the member's latest `recommendedCategories` / `avoidCategories` to decorate each card with a "Recommended for you" or "Go easy this week" badge.

### Marker catalog

`packages/shared/src/constants/marker-catalog.ts` — ~18 markers across hematology, iron, metabolic, lipid, thyroid, vitamin, inflammation, kidney, liver, electrolyte. Each entry has:

- `canonicalName` + `aliases[]` (used to normalise any incoming label)
- `unit`, `refLow`, `refHigh`
- `category` (used to group in UI + prompt)
- `exerciseRelevance` (one-line hint surfaced in the LLM prompt context)

A label the catalog doesn't recognise is silently dropped — the catalog is the source of truth, Grok doesn't get to add markers.

### Guardrails

- Hallucinated marker names → dropped by `normaliseMarkers` before the analyzer runs.
- Analyzer output is Zod-parsed — extra categories, malformed shapes, or missing fields throw.
- Write endpoints are `@Idempotent()` (Redis-backed, 10-min replay window) so a double-click never creates two reports with different readiness scores.
- Raw PDF text is stored on the report for audit, but the UI only exposes the structured rows.

### Why one LLM call, not three

BloodKnows (the reference product) runs a recommendations pass, an insights pass, and a summary pass in parallel and stitches them. I collapsed it to one call because the rule layer already owns marker classification, so the LLM only needs to do the programming judgment on top. Result: lower latency, simpler error handling, still deterministic where it matters.

## Running locally

Requirements: Node ≥ 20, pnpm ≥ 8, Docker, a Grok API key from <https://console.x.ai>.

```bash
pnpm install
cp .env.example .env
# put your Grok key into GROK_API_KEY=…

pnpm db:up                                           # Postgres on :5433
pnpm --filter @gymflow/shared build                  # emit dist for api & web
pnpm --filter @gymflow/api prisma:deploy             # apply migrations
pnpm --filter @gymflow/api seed                      # ~42 members, 470 classes (8 categories), 2.5k booking history
pnpm dev                                             # api + web in parallel
```

URLs:

- <http://localhost:3000> — web UI
- <http://localhost:4000/docs> — API Swagger
- <http://localhost:4000/api/health> — liveness

**Seeded accounts** (see `apps/api/prisma/seed.ts`):

- Admin: `admin@gym.test` / `admin12345`
- Regular cohort (0.94 show rate): `regular0@gym.test` / `member12345`
- Flaky cohort (0.58 show rate): `flaky0@gym.test` / `member12345`
- New cohort (0.74 show rate): `new0@gym.test` / `member12345`

## Testing

```bash
pnpm --filter @gymflow/api test
```

Currently covered:

- `AuthService` — register uniqueness, bcrypt hashing, login credentials, token issuance.
- `NoShowAdvisor` — disabled mode, fail-closed on advisor errors, out-of-range overbook factor.
- `BloodworkClassifier` (manual verification via smoke test) — reference-range + 20% margin rule produces deterministic bands for the seeded sample panels.

Repositories are not mocked at the Prisma level — they're mocked at the repository *interface*. That's the whole point of the repository layer: tests care about "was `decrementCredits(memberId, cost)` called?", not "was `updateMany` with the right `where`?".

## AI assistant policy

An AI assistant (Claude Code) was used during scaffolding and for mechanical refactors (controller/service/repository split, DTO migration to Zod, UI boilerplate). Every architectural decision — the layering rules, the transaction boundaries, the AI advisor contract shape, the in-DB invariants — was made and reviewed by the author. I can defend every file live in the interview walkthrough.

## What this project is not

- **Not a medical device.** The bloodwork analyzer is a demo of the rules-first / LLM-assist pattern — reference ranges are generic adult values, there's no age/sex stratification, and the output is fitness programming, not clinical advice.
- Not multi-tenant. One gym, one workspace.
- No payments — credits are granted by admin.
- No mobile app. Web only.
- No email marketing or trainer CRM features. Virtuagym has those in the real product; they don't serve this demo's story.
- OCR for image-only PDFs is explicitly out of scope — the extractor rejects them with a message asking the user to re-upload or enter values manually.

Every feature is either core-necessary for the booking flow, part of the overbooking advisor, or part of the bloodwork analyzer.

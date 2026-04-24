# Gymflow

Mini gym class booking SaaS with an AI-assisted overbooking advisor. Built as a focused "show" project for the Virtuagym B2B domain (class booking + credits + check-in) with a smart-waitlist feature on top that the base product does not have.

## The idea

The core product is the boring part: members book classes, pay in credits, check in. The interesting part is the **+ layer**:

- **Grok-powered advisor** reads the current class context (bookings, member cohort, recent attendance) and returns a strictly-shaped JSON answer validated by a Zod contract.
- **Smart overbooking**: if expected attendance leaves enough headroom, allow a booking past hard capacity instead of waitlisting.
- **Automatic waitlist promotion**: on cancellation, the head of the waitlist is charged and promoted atomically.
- **Decision audit log**: every advisor call is persisted with prompt, response, rationale, latency, and token usage.
- **Admin override**: flip the advisor off in one click and fall back to hard capacity.

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
    health/     {module, controller}
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

## Running locally

Requirements: Node ≥ 20, pnpm ≥ 8, Docker, a Grok API key from <https://console.x.ai>.

```bash
pnpm install
cp .env.example .env
# put your Grok key into GROK_API_KEY=…

pnpm db:up                                           # Postgres on :5433
pnpm --filter @gymflow/shared build                  # emit dist for api & web
pnpm --filter @gymflow/api prisma:deploy             # apply migrations
pnpm --filter @gymflow/api seed                      # ~42 members, 280 classes, 1.4k history
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

Repositories are not mocked at the Prisma level — they're mocked at the repository *interface*. That's the whole point of the repository layer: tests care about "was `decrementCredits(memberId, cost)` called?", not "was `updateMany` with the right `where`?".

## AI assistant policy

An AI assistant (Claude Code) was used during scaffolding and for mechanical refactors (controller/service/repository split, DTO migration to Zod, UI boilerplate). Every architectural decision — the layering rules, the transaction boundaries, the AI advisor contract shape, the in-DB invariants — was made and reviewed by the author. I can defend every file live in the interview walkthrough.

## What this project is not

- Not multi-tenant. One gym, one workspace.
- No payments — credits are granted by admin.
- No mobile app. Web only.
- No email marketing, nutrition tracking, or trainer CRM features. Virtuagym has those in the real product; they don't serve this demo's story.

Every feature is either core-necessary for the overbooking advisor to work, or part of the advisor itself.

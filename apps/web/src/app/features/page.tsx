import Link from "next/link";

export const metadata = {
  title: "Engineering notes — Gymflow",
  description:
    "Long-form notes on how Gymflow is built: architecture, layering, Zod contracts, in-DB invariants, the Grok advisor, and local setup.",
};

export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-ink-700">
      <article className="prose-gf">
        <header className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.25em] text-ink-400">
            Engineering notes
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-balance text-ink-900">
            Gymflow
          </h1>
          <P>
            Mini gym class booking SaaS with two AI layers on top: an
            overbooking advisor on the class side, and a blood-panel driven
            weekly program on the member side. Built as a focused
            &ldquo;show&rdquo; project for the Virtuagym B2B domain (class
            booking + credits + check-in), then extended with features the
            base product does not have.
          </P>
        </header>

        <H2>The idea</H2>
        <P>
          The core product is the boring part: members book classes, pay in
          credits, check in. The interesting part is the + layer, which is
          now two features.
        </P>

        <H3>+ Overbooking advisor</H3>
        <Ul>
          <Li>
            <B>Grok-powered advisor</B> reads the current class context
            (bookings, member cohort, recent attendance) and returns a
            strictly-shaped JSON answer validated by a Zod contract.
          </Li>
          <Li>
            <B>Smart overbooking:</B> if expected attendance leaves enough
            headroom, allow a booking past hard capacity instead of
            waitlisting.
          </Li>
          <Li>
            <B>Automatic waitlist promotion:</B> on cancellation, the head of
            the waitlist is charged and promoted atomically.
          </Li>
          <Li>
            <B>Decision audit log:</B> every advisor call is persisted with
            prompt, response, rationale, latency, and token usage.
          </Li>
          <Li>
            <B>Admin override:</B> flip the advisor off in one click and fall
            back to hard capacity.
          </Li>
        </Ul>

        <H3>+ Bloodwork-driven weekly program</H3>
        <Ul>
          <Li>
            Members upload a <B>blood-test PDF</B> or enter values manually.
            Recognised markers are classified by a deterministic rule layer,
            then Grok writes a one-week gym plan around the bands.
          </Li>
          <Li>
            <B>Rules first, LLM second:</B> every marker&apos;s interpretation
            (LOW / BORDERLINE / NORMAL / HIGH) comes from a reference-range +
            20% margin rule — not the model. Same input, same bucket, always.
          </Li>
          <Li>
            <B>Editable preview:</B> PDF extraction never saves anything
            directly — the user reviews and edits the pulled rows before
            confirming.
          </Li>
          <Li>
            <B>Tailored class browser:</B> the <C>/book</C> page decorates
            each class card with &ldquo;Recommended for you&rdquo; / &ldquo;Go
            easy this week&rdquo; badges based on the member&apos;s latest{" "}
            <C>recommendedCategories</C> / <C>avoidCategories</C>.
          </Li>
          <Li>
            <B>Inspired by BloodKnows:</B> the <C>rules → stratify → single
            focused LLM call → Zod-validate</C> pipeline is adapted from a
            real bloodwork product, collapsed to one LLM hop because the rule
            layer already does the marker-level work.
          </Li>
        </Ul>

        <H2>Architecture</H2>
        <Pre>{`apps/
  web/   Next.js 15 App Router + Tailwind — admin & member UI
  api/   NestJS 10 + Prisma + Postgres + Grok — domain, booking, AI
packages/
  shared/  Zod schemas + types — the single source of truth for web ↔ api contracts
docker/
  docker-compose.yml       dev (Postgres + Redis)
  docker-compose.prod.yml  full stack (compose-run api + web + db + redis)`}</Pre>

        <H3>API layout — feature-first, capped depth</H3>
        <Pre>{`apps/api/src/
  main.ts
  app.module.ts

  config/                 ← zod-validated env (boot fails fast on a bad secret)
    env.schema.ts
    env.service.ts
    config.module.ts

  core/                   ← infrastructure (DB, cache, HTTP clients)
    prisma/{prisma.module,prisma.service}.ts
    redis/{redis.module,redis.service}.ts

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
    overbooking/{module, controller, no-show-advisor, overbook-decision.repository}
    bloodwork/  {module, controller, service, repository, classifier, analyzer, pdf-extractor}
    realtime/   {module, gateway}          ← Socket.IO gateway with JWT handshake
    health/     {module, controller}       ← liveness ping, not the bloodwork feature`}</Pre>
        <P>
          The root never grows past six entries (<C>main.ts</C>,{" "}
          <C>app.module.ts</C>, <C>config/</C>, <C>core/</C>, <C>common/</C>,{" "}
          <C>modules/</C>). Adding a new feature means one new folder under{" "}
          <C>modules/</C>, nothing else moves.
        </P>

        <H3>Layering rules</H3>
        <Ul>
          <Li>
            Controller only parses input (via a shared Zod schema), calls a
            service, returns the result.
          </Li>
          <Li>
            Service holds domain logic and orchestrates repositories. It
            never touches Prisma directly.
          </Li>
          <Li>
            Repository is the only layer that speaks to Prisma. Methods
            accept an optional <C>Prisma.TransactionClient</C> so services
            can stitch them into a single <C>$transaction</C> without the
            repository owning the transaction.
          </Li>
          <Li>
            Cross-module calls import through <C>@Module({`{ imports }`})</C>
            . No deep reach-in imports.
          </Li>
        </Ul>
        <P>
          This makes testing painless: services are unit-tested with mocked
          repositories (see <C>auth.service.spec.ts</C>,{" "}
          <C>no-show-advisor.service.spec.ts</C>) without any Prisma fakes.
        </P>

        <H2>Zod-driven contracts</H2>
        <P>
          <C>packages/shared</C> holds every request/response schema as a Zod
          object:
        </P>
        <Pre title="packages/shared/src/schemas/ai.schema.ts">
{`export const NoShowAdvisorResponseSchema = z.object({
  expectedAttendance: z.number().min(0),
  expectedNoShows: z.number().min(0),
  overbookRecommendation: z.enum(["ALLOW", "DENY"]),
  riskBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationale: z.string().min(1).max(600),
  perBooking: z.array(...),
});
export type NoShowAdvisorResponse = z.infer<typeof NoShowAdvisorResponseSchema>;`}
        </Pre>
        <P>The same schema is used three ways:</P>
        <Ul>
          <Li>
            <B>API input validation</B> — controllers use{" "}
            <C>@ZodBody(Schema)</C> / <C>@ZodQuery(Schema)</C> decorators
            backed by <C>ZodValidationPipe</C>, which throws a structured
            400 on bad payloads.
          </Li>
          <Li>
            <B>API output validation</B> — the Grok response is parsed with{" "}
            <C>Schema.parse()</C>, so a model hallucination never silently
            becomes a bad domain object.
          </Li>
          <Li>
            <B>Frontend form types</B> — the web app imports the same types,
            so an API rename is a compile error on the form.
          </Li>
        </Ul>

        <H2>Data invariants live in the database</H2>
        <P>
          Booking / credit logic is safety-critical, so the authoritative
          checks live in Postgres:
        </P>
        <Ul>
          <Li>
            <C>CHECK (credits {">="} 0)</C> on <C>Member</C>,{" "}
            <C>CHECK (&quot;remainingCredits&quot; {">="} 0)</C> on{" "}
            <C>CreditPack</C>.
          </Li>
          <Li>
            <C>CHECK (capacity {">"} 0)</C>,{" "}
            <C>CHECK (&quot;durationMinutes&quot; {">"} 0)</C> on <C>Class</C>.
          </Li>
          <Li>
            Partial unique index on <C>Booking (classId, memberId)</C> filtered
            to live statuses — a member can&apos;t have two live rows on the
            same class, but can re-book after cancelling.
          </Li>
          <Li>
            <C>SELECT ... FOR UPDATE</C> on the class row before any capacity
            math.
          </Li>
          <Li>
            <C>SELECT ... FOR UPDATE SKIP LOCKED</C> when promoting the
            waitlist head, so two parallel cancellations don&apos;t promote
            the same member twice.
          </Li>
        </Ul>
        <P>
          See <C>apps/api/prisma/migrations/20260423010000_credit_checks/migration.sql</C>.
        </P>

        <H2>The AI advisor (xAI Grok)</H2>
        <Pre>{`bookings.service ─► no-show-advisor.service ─► grok-client.service ─► POST /chat/completions
                                  │
                                  ├─► prisma.class (read context)
                                  └─► ai-decision.repository (audit)`}</Pre>
        <Ul>
          <Li>
            <C>GrokClient</C> is a thin axios wrapper over xAI&apos;s
            OpenAI-compatible <C>/chat/completions</C>. Returns raw text +
            usage + latency.
          </Li>
          <Li>
            <C>NoShowAdvisor</C> is the domain layer: builds a compact JSON
            prompt from the class + live bookings + recent attendance, asks
            Grok for <C>response_format: json_object</C>, parses with{" "}
            <C>NoShowAdvisorResponseSchema</C>, records the decision, and
            returns an overbook verdict.
          </Li>
          <Li>
            <C>BookingsService.book</C> calls{" "}
            <C>advisor.shouldAllowOverbook</C> <B>outside</B> the transaction
            (HTTP should never hold row locks). The advisor&apos;s verdict is
            advisory; the authoritative capacity check still happens inside
            the tx.
          </Li>
          <Li>
            Admin can disable the advisor or move the overbook factor from
            the UI at any time.
          </Li>
        </Ul>

        <H2>The bloodwork analyzer</H2>
        <Pre>{`POST /bloodwork/extract   (PDF → preview, nothing saved)
POST /bloodwork/reports   (confirm + persist + analyze)
GET  /bloodwork/reports/me           (list)
GET  /bloodwork/reports/me/latest    (latest)
GET  /bloodwork/reports/:id          (detail)
GET  /bloodwork/recommendations/me/latest`}</Pre>
        <P>Pipeline (PDF path):</P>
        <Pre>{`raw PDF ─► pdf-extractor ─► pdf-parse (text layer)
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
                       └─► repository $transaction (report + markers + recommendation)`}</Pre>
        <Ul>
          <Li>
            <B>Domain first, LLM second.</B> <C>classifier.service.ts</C>{" "}
            deterministically buckets every marker into LOW / BORDERLINE_LOW
            / NORMAL / BORDERLINE_HIGH / HIGH using the reference range and a
            20% margin rule (same pattern BloodKnows uses). No LLM runs until
            this is done.
          </Li>
          <Li>
            <B>PDF extraction is non-destructive.</B>{" "}
            <C>pdf-extractor.service.ts</C> pulls the text layer with{" "}
            <C>pdf-parse</C>, then asks Grok to structure it into
            catalog-mapped marker rows. Image-only PDFs are rejected with a
            clear error. The preview is never saved — it&apos;s returned as
            an editable table so the user can correct OCR mistakes before
            committing.
          </Li>
          <Li>
            <B>Single-stage analyzer.</B> <C>analyzer.service.ts</C> makes one
            LLM call over already-classified markers. The model writes the
            program (categories, weekly plan, warnings, per-marker
            qualitative explanation, readiness score 0–100) but is told to
            trust the interpretation bands and never quote raw numbers.
          </Li>
          <Li>
            <B>Atomic persistence.</B> <C>bloodwork.service.ts</C> runs
            normalise → classify → analyze → <C>$transaction</C> persist, so
            you either get a complete report + markers + recommendation or
            nothing.
          </Li>
        </Ul>
        <Pre title="packages/shared/src/schemas/health.schema.ts">
{`export const ProgramRecommendationResponseSchema = z.object({
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
});`}
        </Pre>
        <P>
          <C>ClassCategory</C> (shared enum): <C>HIIT</C>, <C>CARDIO</C>,{" "}
          <C>STRENGTH</C>, <C>YOGA</C>, <C>MOBILITY</C>, <C>PILATES</C>,{" "}
          <C>CYCLING</C>, <C>RECOVERY</C>. Every class row carries one; the{" "}
          <C>/book</C> page matches it against the member&apos;s latest{" "}
          <C>recommendedCategories</C> / <C>avoidCategories</C> to decorate
          each card with a badge.
        </P>

        <H3>Marker catalog</H3>
        <P>
          <C>packages/shared/src/constants/marker-catalog.ts</C> — ~18
          markers across hematology, iron, metabolic, lipid, thyroid,
          vitamin, inflammation, kidney, liver, electrolyte. Each entry has:
        </P>
        <Ul>
          <Li>
            <C>canonicalName</C> + <C>aliases[]</C> (used to normalise any
            incoming label)
          </Li>
          <Li>
            <C>unit</C>, <C>refLow</C>, <C>refHigh</C>
          </Li>
          <Li>
            <C>category</C> (used to group in UI + prompt)
          </Li>
          <Li>
            <C>exerciseRelevance</C> — one-line hint surfaced in the LLM
            prompt context
          </Li>
        </Ul>
        <P>
          A label the catalog doesn&apos;t recognise is silently dropped —
          the catalog is the source of truth, Grok doesn&apos;t get to add
          markers.
        </P>

        <H3>Guardrails</H3>
        <Ul>
          <Li>
            Hallucinated marker names → dropped by <C>normaliseMarkers</C>{" "}
            before the analyzer runs.
          </Li>
          <Li>
            Analyzer output is Zod-parsed — extra categories, malformed
            shapes, or missing fields throw.
          </Li>
          <Li>
            Write endpoints are <C>@Idempotent()</C> (Redis-backed, 10-min
            replay window) so a double-click never creates two reports with
            different readiness scores.
          </Li>
          <Li>
            Raw PDF text is stored on the report for audit, but the UI only
            exposes the structured rows.
          </Li>
        </Ul>

        <H3>Why one LLM call, not three</H3>
        <P>
          BloodKnows (the reference product) runs a recommendations pass, an
          insights pass, and a summary pass in parallel and stitches them. I
          collapsed it to one call because the rule layer already owns
          marker classification, so the LLM only needs to do the programming
          judgment on top. Result: lower latency, simpler error handling,
          still deterministic where it matters.
        </P>

        <H2>Redis (cache + rate limit)</H2>
        <Ul>
          <Li>
            Advice cache keyed by{" "}
            <C>ai:advice:&lt;classId&gt;:sha1(sortedBookingIds | factor)</C>{" "}
            with a 60s TTL. Any booking change shifts the hash → natural
            miss, no manual invalidation from <C>BookingsService</C>.
          </Li>
          <Li>
            Measured in dev: first call ~1.7s (Grok), cached call ~60ms.
          </Li>
          <Li>
            <C>@nestjs/throttler</C> uses the same Redis for its store, so
            multi-instance API nodes share the limiter counters.{" "}
            <C>/api/overbooking</C> = 30/min, <C>/api/bookings</C> POST =
            60/min, rest
            = 240/min.
          </Li>
        </Ul>

        <H2>Running locally</H2>
        <P>
          Requirements: Node ≥ 20, pnpm ≥ 8, Docker, a Grok API key from{" "}
          <Link
            href="https://console.x.ai"
            target="_blank"
            className="text-accent-700 underline-offset-4 hover:underline"
          >
            console.x.ai
          </Link>
          .
        </P>
        <Pre>{`pnpm install
cp .env.example .env
# put your Grok key into GROK_API_KEY=…

pnpm db:up                                           # Postgres + Redis
pnpm --filter @gymflow/shared build                  # emit dist for api & web
pnpm --filter @gymflow/api prisma:deploy             # apply migrations
pnpm --filter @gymflow/api seed                      # ~42 members, 470 classes (8 categories), 2.5k booking history
pnpm dev                                             # api + web in parallel`}</Pre>
        <P>URLs:</P>
        <Ul>
          <Li>
            <C>http://localhost:3000</C> — web UI
          </Li>
          <Li>
            <C>http://localhost:4000/docs</C> — API Swagger
          </Li>
          <Li>
            <C>http://localhost:4000/api/health</C> — liveness
          </Li>
        </Ul>
        <P>
          Seeded accounts (see <C>apps/api/prisma/seed.ts</C>):
        </P>
        <Ul>
          <Li>
            Admin: <C>admin@gym.test</C> / <C>admin12345</C>
          </Li>
          <Li>
            Regular cohort (0.94 show rate): <C>regular0@gym.test</C> /{" "}
            <C>member12345</C>
          </Li>
          <Li>
            Flaky cohort (0.58 show rate): <C>flaky0@gym.test</C> /{" "}
            <C>member12345</C>
          </Li>
          <Li>
            New cohort (0.74 show rate): <C>new0@gym.test</C> /{" "}
            <C>member12345</C>
          </Li>
        </Ul>

        <H2>Testing</H2>
        <Pre>pnpm --filter @gymflow/api test</Pre>
        <P>Currently covered:</P>
        <Ul>
          <Li>
            <C>AuthService</C> — register uniqueness, bcrypt hashing, login
            credentials, token issuance.
          </Li>
          <Li>
            <C>NoShowAdvisor</C> — disabled mode, fail-closed on advisor
            errors, out-of-range overbook factor.
          </Li>
          <Li>
            <C>BloodworkClassifier</C> — manual smoke test confirms
            deterministic bands for seeded sample panels using the
            reference-range + 20% margin rule.
          </Li>
        </Ul>
        <P>
          Repositories are not mocked at the Prisma level — they&apos;re
          mocked at the repository interface. That&apos;s the whole point of
          the repository layer: tests care about &ldquo;was{" "}
          <C>decrementCredits(memberId, cost)</C> called?&rdquo;, not
          &ldquo;was <C>updateMany</C> with the right <C>where</C>?&rdquo;.
        </P>

        <H2>AI assistant policy</H2>
        <P>
          An AI assistant (Claude Code) was used during scaffolding and for
          mechanical refactors (controller / service / repository split, DTO
          migration to Zod, UI boilerplate). Every architectural decision —
          the layering rules, the transaction boundaries, the AI advisor
          contract shape, the in-DB invariants — was made and reviewed by
          the author. I can defend every file live in the interview
          walkthrough.
        </P>

        <H2>What this project is not</H2>
        <Ul>
          <Li>
            <B>Not a medical device.</B> The bloodwork analyzer is a demo of
            the rules-first / LLM-assist pattern — reference ranges are
            generic adult values, there is no age/sex stratification, and the
            output is fitness programming, not clinical advice.
          </Li>
          <Li>Not multi-tenant. One gym, one workspace.</Li>
          <Li>No payments — credits are granted by admin.</Li>
          <Li>No mobile app. Web only.</Li>
          <Li>
            No email marketing or trainer CRM features. Virtuagym has those
            in the real product; they don&apos;t serve this demo&apos;s story.
          </Li>
          <Li>
            OCR for image-only PDFs is explicitly out of scope — the
            extractor rejects them with a message asking the user to
            re-upload or enter values manually.
          </Li>
        </Ul>
        <P>
          Every feature is either core-necessary for the booking flow, part
          of the overbooking advisor, or part of the bloodwork analyzer.
        </P>

        <footer className="mt-16 border-t border-ink-200 pt-8 text-xs text-ink-400">
          <Link
            href="/admin/overbooking"
            className="text-ink-700 underline-offset-4 hover:underline"
          >
            See the advisor in action →
          </Link>
        </footer>
      </article>
    </main>
  );
}

/* ── building blocks ────────────────────────────────────── */

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 font-display text-2xl font-semibold tracking-tight text-ink-900">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 text-base font-semibold text-ink-900">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[15px] leading-relaxed text-ink-600">{children}</p>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-ink-600 marker:text-ink-300">
      {children}
    </ul>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ink-800">{children}</strong>;
}

function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-ink-100 px-1 py-[1px] text-[12.5px] text-ink-800">
      {children}
    </code>
  );
}

function Pre({ children, title }: { children: string; title?: string }) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-ink-800 bg-ink-900 text-ink-100">
      {title && (
        <div className="border-b border-ink-800 px-4 py-2 text-[10.5px] uppercase tracking-[0.2em] text-ink-400">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

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
            Mini gym class booking SaaS with an AI-assisted overbooking
            advisor. Built as a focused &ldquo;show&rdquo; project for the
            Virtuagym B2B domain (class booking + credits + check-in) with a
            smart-waitlist feature on top that the base product does not have.
          </P>
        </header>

        <H2>The idea</H2>
        <P>
          The core product is the boring part: members book classes, pay in
          credits, check in. The interesting part is the + layer:
        </P>
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
    ai/         {module, controller, grok-client, no-show-advisor, ai-decision.repository}
    health/     {module, controller}`}</Pre>
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
            <C>/api/ai</C> = 30/min, <C>/api/bookings</C> POST = 60/min, rest
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
pnpm --filter @gymflow/api seed                      # ~42 members, 280 classes, 1.4k history
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
          <Li>Not multi-tenant. One gym, one workspace.</Li>
          <Li>No payments — credits are granted by admin.</Li>
          <Li>No mobile app. Web only.</Li>
          <Li>
            No email marketing, nutrition tracking, or trainer CRM features.
            Virtuagym has those in the real product; they don&apos;t serve
            this demo&apos;s story.
          </Li>
        </Ul>
        <P>
          Every feature is either core-necessary for the overbooking advisor
          to work, or part of the advisor itself.
        </P>

        <footer className="mt-16 border-t border-ink-200 pt-8 text-xs text-ink-400">
          <Link
            href="/admin/ai"
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

"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Sparkles, Database, Zap, Shield, Layers } from "lucide-react";
import { LoginCard } from "@/components/login-card";
import { useSession } from "@/lib/session";

export default function HomePage() {
  const { user, ready } = useSession();

  return (
    <main className="relative">
      {/* Ambient grid + glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(16,18,24,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,18,24,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse at top, black 40%, transparent 70%)",
          }}
        />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[800px] -translate-x-1/2 rounded-full bg-accent-500/20 blur-[120px]" />
      </div>

      {/* Hero + sign-in */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-20 sm:pt-24 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <span className="fade-up inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-xs text-ink-500 shadow-soft">
            <Sparkles className="h-3 w-3 text-accent-600" />
            Two AI layers · rules-first · Zod-validated
          </span>

          <h1 className="fade-up mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
            A gym booking SaaS where{" "}
            <span className="bg-gradient-to-br from-accent-500 to-accent-700 bg-clip-text text-transparent">
              AI does real work.
            </span>
          </h1>

          <p className="fade-up mt-5 max-w-xl text-base text-ink-500 text-balance">
            One advisor reads live bookings and greenlights safe overbooking
            inside a DB transaction. A second one reads your blood panel and
            rewrites the week&apos;s class plan around what it finds — rules
            classify the markers, the model programs on top.
          </p>

          <div className="fade-up mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 shadow-soft transition hover:border-ink-300"
            >
              See how it works
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/health"
              className="text-sm text-ink-500 transition hover:text-ink-900"
            >
              Bloodwork demo →
            </Link>
          </div>
        </div>

        <div className="fade-up lg:pt-4">
          {ready && user ? (
            <SignedInPanel email={user.email} role={user.role} />
          ) : (
            <Suspense fallback={<div className="h-64" />}>
              <LoginCard />
            </Suspense>
          )}
        </div>
      </section>

      {/* Feature preview tiles */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            icon={<Sparkles className="h-4 w-4" />}
            title="AI advisor"
            body="Grok reads live bookings and returns strict JSON: expected shows, risk band, verdict."
          />
          <Tile
            icon={<Database className="h-4 w-4" />}
            title="Invariants in Postgres"
            body="CHECK constraints + partial unique indexes so bugs can't drive credits negative."
          />
          <Tile
            icon={<Zap className="h-4 w-4" />}
            title="Redis cache"
            body="60s advice cache keyed by the booking-set hash. ~25× faster on repeat calls."
          />
          <Tile
            icon={<Shield className="h-4 w-4" />}
            title="Rate-limited"
            body="Throttler on top of Redis protects the Grok key from runaway spend."
          />
        </div>

        <div className="mt-12 flex items-center justify-between gap-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft sm:p-8">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400">
              <Layers className="h-3 w-3" /> Architecture
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
              Feature-first NestJS, with repositories
            </h2>
            <p className="mt-2 max-w-md text-sm text-ink-500">
              Controller → service → repository. Services never touch Prisma.
              Shared Zod schemas validate both the HTTP boundary and the AI
              contract. New features don&apos;t bloat the root.
            </p>
          </div>
          <Link
            href="/features"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-4 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300"
          >
            Read the tour
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function SignedInPanel({ email, role }: { email: string; role: string }) {
  const dest = role === "ADMIN" ? "/admin" : "/book";
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-lift sm:p-7">
      <div className="text-[11px] uppercase tracking-[0.2em] text-ink-400">
        Signed in
      </div>
      <div className="mt-1 font-display text-xl font-semibold tracking-tight">
        {email}
      </div>
      <div className="mt-1 text-xs text-ink-500">Role: {role}</div>
      <Link
        href={dest}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800"
      >
        Continue to {role === "ADMIN" ? "admin" : "classes"}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Tile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-xl border border-ink-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-700 transition group-hover:bg-accent-100">
        {icon}
      </div>
      <div className="mt-4 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-ink-500">{body}</div>
    </div>
  );
}

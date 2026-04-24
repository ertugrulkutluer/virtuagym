"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Sparkles, AlertTriangle, ArrowRight } from "lucide-react";
import {
  MARKER_CATALOG,
  type ClassCategory,
  type MarkerInterpretation,
} from "@gymflow/shared";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toast";

interface ClassItem {
  id: string;
  title: string;
  category: ClassCategory;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  creditCost: number;
  location: string | null;
  trainer: { id: string; name: string } | null;
  _count: { bookings: number };
}

interface ClassList {
  items: ClassItem[];
  total: number;
}

interface PerMarkerGuidance {
  canonicalName: string;
  interpretation: MarkerInterpretation;
  explanation: string;
  impact: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  suggestedCategories: ClassCategory[];
  avoidCategories: ClassCategory[];
}

interface Recommendation {
  id: string;
  readinessScore: number;
  recommendedCategories: ClassCategory[];
  avoidCategories: ClassCategory[];
  perMarker: PerMarkerGuidance[];
  summary: string;
  validUntil: string;
  createdAt: string;
}

/**
 * Given the category of a class and which tone (good/avoid), find up to
 * two perMarker explanations that justify the tag. Priority: out-of-range
 * markers first, then borderline, then the highest-impact one.
 */
function reasonsForCategory(
  rec: Recommendation | null,
  category: ClassCategory,
  tone: "good" | "avoid",
): PerMarkerGuidance[] {
  if (!rec) return [];
  const list = rec.perMarker.filter((m) => {
    const cats = tone === "good" ? m.suggestedCategories : m.avoidCategories;
    return cats.includes(category);
  });
  const impactRank = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 } as const;
  const interpRank: Record<MarkerInterpretation, number> = {
    LOW: 0,
    HIGH: 0,
    BORDERLINE_LOW: 1,
    BORDERLINE_HIGH: 1,
    NORMAL: 2,
    UNKNOWN: 3,
  };
  return [...list]
    .sort(
      (a, b) =>
        interpRank[a.interpretation] - interpRank[b.interpretation] ||
        impactRank[a.impact] - impactRank[b.impact],
    )
    .slice(0, 2);
}

function markerLabel(canonicalName: string): string {
  return (
    MARKER_CATALOG.find((m) => m.canonicalName === canonicalName)?.label ??
    canonicalName
  );
}

export default function BookPage() {
  const { token, user, ready } = useSession();
  const toast = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const list = await api.get<ClassList>(`/api/classes?from=${now}`);
      setClasses(list.items);
      if (user) {
        const me = await api.get<{ credits: number }>("/api/members/me", token);
        setBalance(me.credits);
        try {
          const r = await api.get<Recommendation | null>(
            "/api/bloodwork/recommendations/me/latest",
            token,
          );
          setRec(r);
        } catch {
          setRec(null);
        }
      } else {
        setBalance(null);
        setRec(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user?.id]);

  const book = async (classId: string) => {
    try {
      const res = await api.post<{
        status: string;
        waitlistPosition: number | null;
      }>("/api/bookings", { classId }, token);
      if (res.status === "WAITLISTED") {
        toast.show(`Waitlisted at position ${res.waitlistPosition}`);
      } else {
        toast.success(`Booked — ${res.status.toLowerCase()}`);
      }
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? String(err.body?.message ?? err.message)
          : String(err),
      );
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming classes</h1>
        {balance !== null && (
          <div className="text-sm text-slate-600">
            Credits: <span className="font-semibold text-slate-900">{balance}</span>
          </div>
        )}
      </div>

      {user && !rec && !loading && (
        <Link
          href="/health"
          className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-4 py-3 text-xs text-ink-600 transition hover:border-ink-300"
        >
          <FlaskConical className="h-4 w-4 text-accent-600" />
          <span>
            Upload a blood panel in <strong>Health</strong> and these classes
            will be tailored to your markers.
          </span>
        </Link>
      )}
      {rec && (
        <div className="mt-4 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-700 shadow-soft">
          <div className="flex items-center gap-2 font-medium text-ink-900">
            <Sparkles className="h-3.5 w-3.5 text-accent-600" />
            Tuned to your latest blood panel (readiness{" "}
            <span className="font-semibold">{rec.readinessScore}</span>)
          </div>
          <div className="mt-1 text-ink-500">
            Favouring {rec.recommendedCategories.join(", ").toLowerCase() || "balanced work"}
            {rec.avoidCategories.length > 0 && (
              <>
                {" · "}easing off {rec.avoidCategories.join(", ").toLowerCase()}
              </>
            )}
            .{" "}
            <Link href="/health" className="underline hover:text-ink-900">
              See report →
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-10 text-sm text-slate-500">Loading…</div>
      ) : classes.length === 0 ? (
        <div className="mt-10 text-sm text-slate-500">No upcoming classes.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              klass={c}
              rec={rec}
              signedIn={Boolean(user)}
              onBook={() => book(c.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// ── Class card ───────────────────────────────────────────────

function ClassCard({
  klass,
  rec,
  signedIn,
  onBook,
}: {
  klass: ClassItem;
  rec: Recommendation | null;
  signedIn: boolean;
  onBook: () => void;
}) {
  const full = klass._count.bookings >= klass.capacity;
  const isGood = Boolean(rec?.recommendedCategories.includes(klass.category));
  const isAvoid = Boolean(rec?.avoidCategories.includes(klass.category));
  const reasons = useMemo(
    () =>
      isGood
        ? reasonsForCategory(rec, klass.category, "good")
        : isAvoid
          ? reasonsForCategory(rec, klass.category, "avoid")
          : [],
    [rec, klass.category, isGood, isAvoid],
  );

  const border = isGood
    ? "border-emerald-200"
    : isAvoid
      ? "border-amber-200"
      : "border-slate-200";

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-soft transition hover:shadow-lift ${border}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-ink-900">{klass.title}</div>
            <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
              {klass.category}
            </span>
            {isGood && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <Sparkles className="h-3 w-3" /> Recommended for you
              </span>
            )}
            {isAvoid && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Go easy this week
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {new Date(klass.startsAt).toLocaleString()} · {klass.durationMinutes}{" "}
            min
            {klass.trainer ? ` · ${klass.trainer.name}` : ""}
            {klass.location ? ` · ${klass.location}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-500">
            {klass._count.bookings}/{klass.capacity} · {klass.creditCost} credit
            {klass.creditCost > 1 ? "s" : ""}
          </div>
          {signedIn ? (
            <button
              onClick={onBook}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              {full ? "Waitlist" : "Book"}
            </button>
          ) : (
            <a
              href="/"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Sign in to book
            </a>
          )}
        </div>
      </div>

      {reasons.length > 0 && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            isGood
              ? "bg-emerald-50/60 text-emerald-800"
              : "bg-amber-50/70 text-amber-900"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <div key={r.canonicalName} className="flex gap-2">
                  <span className="font-semibold whitespace-nowrap">
                    {markerLabel(r.canonicalName)} ·{" "}
                    {formatBand(r.interpretation)}:
                  </span>
                  <span className="text-ink-700">{r.explanation}</span>
                </div>
              ))}
            </div>
            <Link
              href="/health"
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-[10px] font-medium transition ${
                isGood
                  ? "border-emerald-200 text-emerald-700 hover:border-emerald-300"
                  : "border-amber-200 text-amber-800 hover:border-amber-300"
              }`}
            >
              See report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

function formatBand(i: MarkerInterpretation): string {
  switch (i) {
    case "LOW":
      return "low";
    case "HIGH":
      return "high";
    case "BORDERLINE_LOW":
      return "near the lower edge";
    case "BORDERLINE_HIGH":
      return "near the upper edge";
    case "NORMAL":
      return "normal";
    default:
      return "unclassified";
  }
}

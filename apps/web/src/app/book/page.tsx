"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical, Sparkles, AlertTriangle } from "lucide-react";
import type { ClassCategory } from "@gymflow/shared";
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

interface Recommendation {
  id: string;
  readinessScore: number;
  recommendedCategories: ClassCategory[];
  avoidCategories: ClassCategory[];
  summary: string;
  validUntil: string;
  createdAt: string;
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

  const recSet = {
    good: new Set(rec?.recommendedCategories ?? []),
    avoid: new Set(rec?.avoidCategories ?? []),
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
          {classes.map((c) => {
            const full = c._count.bookings >= c.capacity;
            const isGood = recSet.good.has(c.category);
            const isAvoid = recSet.avoid.has(c.category);
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-lg border bg-white p-4 transition ${
                  isGood
                    ? "border-emerald-200 shadow-soft"
                    : isAvoid
                      ? "border-amber-200"
                      : "border-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{c.title}</div>
                    <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                      {c.category}
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
                    {new Date(c.startsAt).toLocaleString()} · {c.durationMinutes} min
                    {c.trainer ? ` · ${c.trainer.name}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-slate-500">
                    {c._count.bookings}/{c.capacity} · {c.creditCost} credit
                    {c.creditCost > 1 ? "s" : ""}
                  </div>
                  {user ? (
                    <button
                      onClick={() => book(c.id)}
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
            );
          })}
        </div>
      )}
    </main>
  );
}

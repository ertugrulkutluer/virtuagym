"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Modal, ModalButton } from "@/components/modal";
import { useToast } from "@/components/toast";

interface Status {
  enabled: boolean;
  overbookFactor: number;
}

interface Advice {
  expectedAttendance: number;
  expectedNoShows: number;
  overbookRecommendation: "ALLOW" | "DENY";
  riskBand: "LOW" | "MEDIUM" | "HIGH";
  rationale: string;
  perBooking: Array<{
    bookingId: string;
    showProbability: number;
    note?: string;
  }>;
}

interface DecisionRow {
  id: string;
  classId: string;
  expectedAttendance: number;
  overbookAllowed: boolean;
  riskBand: string;
  rationale: string;
  latencyMs: number;
  createdAt: string;
}

interface UpcomingClass {
  id: string;
  title: string;
  startsAt: string;
  capacity: number;
  _count: { bookings: number };
}

export default function AdminAiPage() {
  const { token, user, ready } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [classes, setClasses] = useState<UpcomingClass[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [history, setHistory] = useState<DecisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [factorOpen, setFactorOpen] = useState(false);
  const [factorVal, setFactorVal] = useState(0.9);

  const selectedClass = classes.find((c) => c.id === classId);

  const reload = async () => {
    const [s, h, cls] = await Promise.all([
      api.get<Status>("/api/ai/status", token),
      api.get<DecisionRow[]>("/api/ai/decisions?limit=20", token),
      api.get<{ items: UpcomingClass[] }>(
        `/api/classes?from=${new Date().toISOString()}`,
        token,
      ),
    ]);
    setStatus(s);
    setHistory(h);
    setClasses(cls.items);
    if (!classId && cls.items.length) setClassId(cls.items[0]!.id);
    setFactorVal(s.overbookFactor);
  };

  useEffect(() => {
    if (ready && user?.role === "ADMIN") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user?.role]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const next = await api.post<Status>(
        "/api/ai/toggle",
        { enabled: !status.enabled },
        token,
      );
      setStatus(next);
      toast.success(`AI advisor ${next.enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveFactor = async () => {
    setBusy(true);
    try {
      const next = await api.post<Status>(
        "/api/ai/toggle",
        { overbookFactor: factorVal },
        token,
      );
      setStatus(next);
      toast.success(`Safety margin → ${(next.overbookFactor * 100).toFixed(0)}%`);
      setFactorOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const advise = async () => {
    if (!classId) return;
    setBusy(true);
    try {
      const res = await api.get<Advice>(`/api/ai/class/${classId}`, token);
      setAdvice(res);
      toast.success(`Advice ready · ${res.riskBand.toLowerCase()} risk`);
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? String(err.body?.message ?? err.message)
          : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!user || user.role !== "ADMIN") return null;

  const capacity = selectedClass?.capacity ?? 0;
  const safeCeiling = capacity * (status?.overbookFactor ?? 0.9);
  const headroom = advice ? safeCeiling - advice.expectedAttendance : 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">AI advisor</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-2xl">
        When a class fills up, the advisor looks at who booked (regulars vs
        flakes vs new), guesses how many will <em>actually</em> show up, and
        tells you whether it&apos;s safe to let one more person book past the
        hard capacity. Every call is logged below for audit.
      </p>

      {status && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <StatusCard
            label="Advisor"
            value={status.enabled ? "Enabled" : "Disabled"}
            hint={
              status.enabled
                ? "Booking a full class consults Grok before waitlisting."
                : "Hard capacity only. No overbooking, no AI calls."
            }
            action={
              <button
                disabled={busy}
                onClick={toggle}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {status.enabled ? "Disable" : "Enable"}
              </button>
            }
            tone={status.enabled ? "emerald" : "slate"}
          />
          <StatusCard
            label={`Safety margin · ${(status.overbookFactor * 100).toFixed(0)}% of capacity`}
            value={`capacity × ${status.overbookFactor}`}
            hint="Allow overbook only when expected attendance + 1 new seat stays below this ceiling."
            action={
              <button
                disabled={busy}
                onClick={() => setFactorOpen(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Change
              </button>
            }
          />
        </div>
      )}

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Pick a class
            </div>
            <h2 className="mt-1 text-base font-semibold">
              Ask the advisor for a verdict
            </h2>
            <p className="mt-1 text-xs text-slate-500 max-w-md">
              The advisor reads live bookings and recent attendance, then
              returns expected shows + a recommendation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {new Date(c.startsAt).toLocaleString()} · {c.title} (
                  {c._count.bookings}/{c.capacity})
                </option>
              ))}
            </select>
            <button
              disabled={busy || !classId}
              onClick={advise}
              className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Ask advisor
            </button>
          </div>
        </div>

        {advice && selectedClass && (
          <>
            <div
              className={`mt-5 rounded-lg border px-4 py-3 ${
                advice.overbookRecommendation === "ALLOW"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    advice.overbookRecommendation === "ALLOW"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-600 text-white"
                  }`}
                >
                  {advice.overbookRecommendation === "ALLOW"
                    ? "Safe to overbook"
                    : "Don't overbook"}
                </div>
                <RiskBadge band={advice.riskBand} />
              </div>
              <div className="mt-3 text-sm text-slate-700 italic">
                “{advice.rationale}”
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                How the advisor got there
              </div>
              <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                <Row
                  label="Booked right now"
                  value={`${advice.perBooking.length} of ${selectedClass.capacity}`}
                  hint="Live bookings (ACTIVE + PROMOTED)."
                />
                <Row
                  label="Expected to actually show"
                  value={advice.expectedAttendance.toFixed(2)}
                  hint="Sum of per-member show probabilities. A booking worth 0.9 counts as 0.9 people."
                />
                <Row
                  label="Expected no-shows"
                  value={advice.expectedNoShows.toFixed(2)}
                  hint="Booked − expected shows."
                />
                <Row
                  label={`Safe ceiling (${((status?.overbookFactor ?? 0.9) * 100).toFixed(0)}% of capacity)`}
                  value={safeCeiling.toFixed(2)}
                  hint={`${selectedClass.capacity} × ${status?.overbookFactor ?? 0.9}`}
                />
                <Row
                  label="Headroom for one more"
                  value={headroom.toFixed(2)}
                  hint="safe ceiling − expected shows. If ≥ 1, the next booking goes ACTIVE instead of WAITLISTED."
                  highlight={headroom >= 1 ? "emerald" : "slate"}
                />
              </div>
            </div>

            {advice.perBooking.length > 0 && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Who&apos;s likely to show
                </div>
                <ul className="space-y-2 text-sm">
                  {advice.perBooking.map((p, i) => (
                    <li key={p.bookingId} className="flex items-center gap-3">
                      <span className="w-10 text-xs text-slate-500 tabular-nums">
                        #{i + 1}
                      </span>
                      <span className="w-12 tabular-nums text-slate-700 font-medium">
                        {(p.showProbability * 100).toFixed(0)}%
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full ${
                            p.showProbability >= 0.75
                              ? "bg-emerald-500"
                              : p.showProbability >= 0.5
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${p.showProbability * 100}%` }}
                        />
                      </div>
                      {p.note && (
                        <span className="text-xs text-slate-500 max-w-[40%] truncate">
                          {p.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Decision log
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Every call the advisor makes is stored here with its rationale and
          response time. Use this to audit what the AI decided and when.
        </p>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Expected shows</th>
                <th className="px-4 py-2 text-left">Risk</th>
                <th className="px-4 py-2 text-left">Verdict</th>
                <th className="px-4 py-2 text-left">Response time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {d.expectedAttendance.toFixed(1)}
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge band={d.riskBand} compact />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        d.overbookAllowed
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {d.overbookAllowed ? "Allow overbook" : "Hard cap"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {(d.latencyMs / 1000).toFixed(2)}s
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No decisions yet — ask the advisor for a class above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={factorOpen}
        onClose={() => setFactorOpen(false)}
        title="Safety margin"
        description="How much of the room capacity the advisor is allowed to 'fill' with expected shows before it stops approving overbooks. Lower = more conservative."
        footer={
          <>
            <ModalButton onClick={() => setFactorOpen(false)}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              disabled={busy || factorVal < 0.5 || factorVal > 1.2}
              onClick={saveFactor}
            >
              Save
            </ModalButton>
          </>
        }
      >
        <label className="block">
          <span className="text-xs text-slate-500">
            Factor (0.5 – 1.2) · {(factorVal * 100).toFixed(0)}% of capacity
          </span>
          <input
            type="number"
            step="0.05"
            min={0.5}
            max={1.2}
            value={factorVal}
            onChange={(e) => setFactorVal(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Example: a class with capacity 10 and factor 0.9 will allow overbook
          only when the advisor expects fewer than 9 people to actually show
          up.
        </p>
      </Modal>
    </main>
  );
}

function StatusCard({
  label,
  value,
  hint,
  action,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  action: React.ReactNode;
  tone?: "emerald" | "slate";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "emerald"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">
            {label}
          </div>
          <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
        {action}
      </div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: "emerald" | "slate";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 px-4 py-3 ${
        highlight === "emerald" ? "bg-emerald-50/50" : ""
      }`}
    >
      <div className="flex-1">
        <div className="text-sm text-slate-800">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RiskBadge({
  band,
  compact,
}: {
  band: string;
  compact?: boolean;
}) {
  const tone =
    band === "HIGH"
      ? "bg-rose-100 text-rose-800"
      : band === "MEDIUM"
      ? "bg-amber-100 text-amber-800"
      : "bg-emerald-100 text-emerald-800";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {compact ? band.toLowerCase() : `${band.toLowerCase()} risk`}
    </span>
  );
}

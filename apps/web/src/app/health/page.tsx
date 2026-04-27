"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Upload,
  FlaskConical,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  Plus,
} from "lucide-react";
import {
  MARKER_CATALOG,
  type ClassCategory,
  type MarkerInterpretation,
} from "@gymflow/shared";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  maybeNotify,
  requestNotificationPermissionIfPossible,
  useSocket,
} from "@/lib/socket";
import { useToast } from "@/components/toast";

// ── Types (shaped to match the API response) ────────────────────────

interface BloodMarker {
  id: string;
  canonicalName: string;
  label: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  interpretation: MarkerInterpretation;
}
interface Recommendation {
  id: string;
  readinessScore: number;
  recommendedCategories: ClassCategory[];
  avoidCategories: ClassCategory[];
  weeklyPlan: string;
  warnings: string[];
  summary: string;
  perMarker: Array<{
    canonicalName: string;
    interpretation: MarkerInterpretation;
    explanation: string;
    impact: "NONE" | "LOW" | "MEDIUM" | "HIGH";
    suggestedCategories: ClassCategory[];
    avoidCategories: ClassCategory[];
  }>;
  validUntil: string;
  createdAt: string;
}
interface Report {
  id: string;
  source: "MANUAL" | "PDF_UPLOAD";
  labName: string | null;
  collectedAt: string | null;
  markers: BloodMarker[];
  recommendation: Recommendation | null;
  createdAt: string;
}
interface ExtractionPreviewMarker {
  rawLabel: string;
  canonicalName: string | null;
  label: string;
  value: number | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  recognised: boolean;
}
interface ExtractionPreview {
  rawText: string;
  collectedAt: string | null;
  labName: string | null;
  markers: ExtractionPreviewMarker[];
}

interface DraftMarker {
  canonicalName: string;
  label: string;
  value: string; // free-form input; parsed on submit
  unit: string;
  refLow: string;
  refHigh: string;
}

// ── Page ─────────────────────────────────────────────────────────────

interface PendingAnalysis {
  reportId: string;
  startedAt: number;
  markers: number;
}

export default function HealthPage() {
  const { token, user, ready } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { socket, connected } = useSocket(token);

  const [latest, setLatest] = useState<Report | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [pending, setPending] = useState<PendingAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);

  const displayedReport = selected ?? latest;
  const viewingPast = Boolean(selected && latest && selected.id !== latest.id);

  // ── initial load ────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [latest, list] = await Promise.all([
          api.get<Report | null>("/api/bloodwork/reports/me/latest", token),
          api.get<Report[]>("/api/bloodwork/reports/me", token),
        ]);
        if (cancelled) return;
        setLatest(latest);
        setHistory(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) {
          toast.error(`Could not load reports: ${err.message}`);
        }
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id, token]);

  // ── fetch a history item when clicked ───────────────────────
  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    if (selected?.id === selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<Report>(
          `/api/bloodwork/reports/${selectedId}`,
          token,
        );
        if (!cancelled) setSelected(r);
      } catch (err) {
        if (!cancelled && err instanceof ApiError) {
          toast.error(`Could not load report: ${err.message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, token]);

  // ── socket: realtime analysis status ───────────────────────
  useEffect(() => {
    if (!socket) return;

    const onStarted = (p: { reportId: string; markers: number }) => {
      setPending({
        reportId: p.reportId,
        startedAt: Date.now(),
        markers: p.markers,
      });
    };

    const onCompleted = async (p: {
      reportId: string;
      readinessScore: number;
      recommendedCategories: string[];
      avoidCategories: string[];
    }) => {
      setPending(null);
      try {
        const [fresh, list] = await Promise.all([
          api.get<Report | null>("/api/bloodwork/reports/me/latest", token),
          api.get<Report[]>("/api/bloodwork/reports/me", token),
        ]);
        setLatest(fresh);
        setHistory(list);
      } catch {
        /* ignore */
      }
      toast.success(`Analysis ready — readiness ${p.readinessScore}`);
      await maybeNotify("Your bloodwork analysis is ready", {
        body: `Readiness ${p.readinessScore} · ${p.recommendedCategories.length} categories recommended`,
        tag: `bloodwork-${p.reportId}`,
        onClick: () => router.push("/health"),
      });
    };

    const onFailed = (p: { reportId: string; message: string }) => {
      setPending(null);
      toast.error(`Analysis failed: ${p.message}`);
      void maybeNotify("Bloodwork analysis failed", {
        body: p.message,
        tag: `bloodwork-${p.reportId}-failed`,
      });
    };

    socket.on("bloodwork:started", onStarted);
    socket.on("bloodwork:completed", onCompleted);
    socket.on("bloodwork:failed", onFailed);
    return () => {
      socket.off("bloodwork:started", onStarted);
      socket.off("bloodwork:completed", onCompleted);
      socket.off("bloodwork:failed", onFailed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, token]);

  if (!ready || !user) return null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400">
            <FlaskConical className="h-3 w-3" /> Bloodwork
            <span
              className={`ml-1 inline-flex h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-ink-300"}`}
              title={connected ? "realtime connected" : "offline"}
            />
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Your weekly program, tuned to your blood panel.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            {UPLOAD_ENABLED
              ? "Upload a lab PDF or enter values manually."
              : "Enter your blood marker values manually."}{" "}
            Rules classify each marker deterministically; Grok writes the
            week&apos;s training plan from the bands, not the raw numbers.
          </p>
        </div>
      </header>

      {pending && <PendingBanner pending={pending} />}

      {loadingLatest ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {viewingPast && (
            <button
              onClick={() => setSelectedId(null)}
              className="mt-6 inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-700 shadow-soft transition hover:border-ink-300"
            >
              ← Back to current report
            </button>
          )}

          {displayedReport?.recommendation && (
            <LatestReportCard
              report={displayedReport}
              isPast={viewingPast}
            />
          )}

          {!viewingPast && (
            <UploadSection
              token={token}
              onPending={(reportId, markers) => {
                setPending({
                  reportId,
                  startedAt: Date.now(),
                  markers,
                });
              }}
            />
          )}

          {history.length > 1 && (
            <HistorySection
              reports={history}
              selectedId={selectedId ?? latest?.id ?? null}
              onSelect={(id) => setSelectedId(id === latest?.id ? null : id)}
            />
          )}
        </>
      )}
    </main>
  );
}

// ── Latest report panel (readiness, badges, weekly plan, warnings) ───

function LatestReportCard({
  report,
  isPast = false,
}: {
  report: Report;
  isPast?: boolean;
}) {
  const rec = report.recommendation!;
  return (
    <section className="mt-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-lift sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <ReadinessRing score={rec.readinessScore} />
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-ink-400">
              {isPast ? "Past readiness" : "This week's readiness"}
            </div>
            <div className="mt-1 font-display text-2xl font-semibold tracking-tight">
              {readinessLabel(rec.readinessScore)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              Report from {fmtDate(report.createdAt)} · valid until{" "}
              {fmtDate(rec.validUntil)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rec.recommendedCategories.map((c) => (
            <CategoryBadge key={c} category={c} tone="good" />
          ))}
          {rec.avoidCategories.map((c) => (
            <CategoryBadge key={c} category={c} tone="avoid" />
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-ink-700">{rec.summary}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionTitle icon={<Activity className="h-3 w-3" />}>
            Plan for this week
          </SectionTitle>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            {rec.weeklyPlan}
          </p>
        </div>

        {rec.warnings.length > 0 && (
          <div>
            <SectionTitle icon={<AlertTriangle className="h-3 w-3" />}>
              Cautions
            </SectionTitle>
            <ul className="mt-2 space-y-2">
              {rec.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8">
        <SectionTitle>Marker details</SectionTitle>
        <div className="mt-3 overflow-hidden rounded-lg border border-ink-100">
          <table className="w-full text-xs">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Marker</th>
                <th className="px-3 py-2 text-left font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Reference</th>
                <th className="px-3 py-2 text-left font-medium">Band</th>
                <th className="px-3 py-2 text-left font-medium">Impact</th>
              </tr>
            </thead>
            <tbody>
              {report.markers.map((m) => {
                const perM = rec.perMarker.find(
                  (p) => p.canonicalName === m.canonicalName,
                );
                return (
                  <tr
                    key={m.id}
                    className="border-t border-ink-100 text-ink-700"
                  >
                    <td className="px-3 py-2 font-medium text-ink-900">
                      {m.label}
                    </td>
                    <td className="px-3 py-2">
                      {m.value} <span className="text-ink-400">{m.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {m.refLow ?? "—"}–{m.refHigh ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <InterpretationPill interpretation={m.interpretation} />
                    </td>
                    <td className="px-3 py-2 text-ink-500">
                      {perM?.impact ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rec.perMarker.some((m) => m.explanation) && (
          <div className="mt-4 space-y-3">
            {rec.perMarker.map((m) => (
              <div
                key={m.canonicalName}
                className="rounded-md border border-ink-100 bg-ink-50/60 p-3"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-ink-900">
                    {MARKER_CATALOG.find((c) => c.canonicalName === m.canonicalName)
                      ?.label ?? m.canonicalName}
                  </span>
                  <InterpretationPill interpretation={m.interpretation} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-700">
                  {m.explanation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-ink-500">
        <Link
          href="/book"
          className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-ink-700 transition hover:border-ink-300"
        >
          Browse tailored classes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

// ── Pending banner ──────────────────────────────────────────────────

function PendingBanner({ pending }: { pending: PendingAnalysis }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - pending.startedAt) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [pending.startedAt]);

  return (
    <section className="mt-6 flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3">
      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-accent-700" />
      <div className="flex-1">
        <div className="text-sm font-medium text-ink-900">
          Analyzing your {pending.markers} markers…
        </div>
        <div className="text-xs text-ink-500">
          Report saved. Grok is writing the weekly plan — this usually takes
          3–6 seconds. You can leave the page; we&apos;ll ping you when it&apos;s
          ready.
        </div>
      </div>
      <span className="font-variant-numeric rounded bg-white px-2 py-1 text-xs text-ink-600">
        {elapsed}s
      </span>
    </section>
  );
}

// ── Upload + manual entry ───────────────────────────────────────────

const UPLOAD_ENABLED =
  process.env.NEXT_PUBLIC_UPLOAD_ENABLED !== "false";

function UploadSection({
  token,
  onPending,
}: {
  token: string | null;
  onPending: (reportId: string, markers: number) => void;
}) {
  const [mode, setMode] = useState<"pdf" | "manual">(
    UPLOAD_ENABLED ? "pdf" : "manual",
  );
  return (
    <section className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-400">
            New report
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
            {UPLOAD_ENABLED
              ? "Upload a lab PDF or enter values"
              : "Enter values manually"}
          </h2>
        </div>
        {UPLOAD_ENABLED && (
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-1 text-xs">
            <Tab active={mode === "pdf"} onClick={() => setMode("pdf")}>
              PDF upload
            </Tab>
            <Tab active={mode === "manual"} onClick={() => setMode("manual")}>
              Manual
            </Tab>
          </div>
        )}
      </div>

      <div className="mt-6">
        {UPLOAD_ENABLED && mode === "pdf" ? (
          <PdfFlow token={token} onPending={onPending} />
        ) : (
          <ManualFlow token={token} onPending={onPending} />
        )}
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 transition ${
        active
          ? "bg-white text-ink-900 shadow-soft"
          : "text-ink-500 hover:text-ink-900"
      }`}
    >
      {children}
    </button>
  );
}

// ── PDF flow: upload → preview → confirm+analyze ───

function PdfFlow({
  token,
  onPending,
}: {
  token: string | null;
  onPending: (reportId: string, markers: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [drafts, setDrafts] = useState<DraftMarker[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const pickFile = () => inputRef.current?.click();

  const extract = async () => {
    if (!file) {
      toast.error("Pick a PDF first");
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.postForm<ExtractionPreview>(
        "/api/bloodwork/extract",
        fd,
        token,
      );
      setPreview(res);
      setDrafts(
        res.markers
          .filter((m) => m.recognised && m.value != null)
          .map((m) => toDraft(m)),
      );
      toast.success(`Found ${res.markers.length} rows — edit and confirm`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async () => {
    const payload = draftsToPayload(drafts);
    if (payload.markers.length === 0) {
      toast.error("At least one marker is required");
      return;
    }
    setSubmitting(true);
    // Ask for notification permission while we still have a user gesture.
    await requestNotificationPermissionIfPossible();
    try {
      const res = await api.post<{
        reportId: string;
        pending: true;
        markers: number;
      }>(
        "/api/bloodwork/reports",
        {
          ...payload,
          source: "PDF_UPLOAD",
          rawText: preview?.rawText,
          labName: preview?.labName ?? undefined,
          collectedAt: preview?.collectedAt ?? undefined,
        },
        token,
      );
      onPending(res.reportId, res.markers);
      setFile(null);
      setPreview(null);
      setDrafts([]);
      toast.success("Report saved — analyzing in the background");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {!preview && (
        <div>
          <div
            onClick={pickFile}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 px-6 py-10 text-center transition hover:border-ink-300"
          >
            <Upload className="h-6 w-6 text-ink-400" />
            <div className="text-sm font-medium">
              {file ? file.name : "Click to select a lab PDF"}
            </div>
            <div className="text-xs text-ink-500">
              Max 5 MB · text PDFs only (scanned images not supported yet)
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={extract}
              disabled={!file || extracting}
              className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800 disabled:opacity-50"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Extracting…
                </>
              ) : (
                <>
                  Extract markers <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div>
          <div className="rounded-md border border-ink-100 bg-ink-50/60 px-3 py-2 text-xs text-ink-600">
            Extracted {preview.markers.length} rows
            {preview.labName ? ` from ${preview.labName}` : ""} — review,
            edit, or delete before confirming.
          </div>
          <MarkerDraftTable drafts={drafts} setDrafts={setDrafts} />
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button
              onClick={() => {
                setPreview(null);
                setFile(null);
                setDrafts([]);
              }}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 transition hover:border-ink-300"
            >
              Start over
            </button>
            <button
              onClick={confirm}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  Confirm and analyze <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualFlow({
  token,
  onPending,
}: {
  token: string | null;
  onPending: (reportId: string, markers: number) => void;
}) {
  const [drafts, setDrafts] = useState<DraftMarker[]>(defaultManualDrafts());
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const submit = async () => {
    const payload = draftsToPayload(drafts);
    if (payload.markers.length === 0) {
      toast.error("Fill at least one marker");
      return;
    }
    setSubmitting(true);
    await requestNotificationPermissionIfPossible();
    try {
      const res = await api.post<{
        reportId: string;
        pending: true;
        markers: number;
      }>("/api/bloodwork/reports", { ...payload, source: "MANUAL" }, token);
      onPending(res.reportId, res.markers);
      setDrafts(defaultManualDrafts());
      toast.success("Report saved — analyzing in the background");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <MarkerDraftTable drafts={drafts} setDrafts={setDrafts} />
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              Analyze <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Editable draft table (shared by pdf + manual) ────────────────────

function MarkerDraftTable({
  drafts,
  setDrafts,
}: {
  drafts: DraftMarker[];
  setDrafts: React.Dispatch<React.SetStateAction<DraftMarker[]>>;
}) {
  const update = (i: number, patch: Partial<DraftMarker>) =>
    setDrafts((prev) =>
      prev.map((d, j) => (i === j ? { ...d, ...patch } : d)),
    );
  const remove = (i: number) =>
    setDrafts((prev) => prev.filter((_, j) => j !== i));
  const add = (canonicalName: string) => {
    const def = MARKER_CATALOG.find((c) => c.canonicalName === canonicalName);
    if (!def) return;
    if (drafts.some((d) => d.canonicalName === canonicalName)) return;
    setDrafts((prev) => [
      ...prev,
      {
        canonicalName,
        label: def.label,
        value: "",
        unit: def.unit,
        refLow: String(def.refLow),
        refHigh: String(def.refHigh),
      },
    ]);
  };

  const remainingOptions = useMemo(
    () =>
      MARKER_CATALOG.filter(
        (c) => !drafts.some((d) => d.canonicalName === c.canonicalName),
      ),
    [drafts],
  );

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-ink-100">
      <table className="w-full text-xs">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Marker</th>
            <th className="px-3 py-2 text-left font-medium">Value</th>
            <th className="px-3 py-2 text-left font-medium">Unit</th>
            <th className="px-3 py-2 text-left font-medium">Ref low</th>
            <th className="px-3 py-2 text-left font-medium">Ref high</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {drafts.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-4 text-center text-xs text-ink-500"
              >
                No markers yet — pick one below to add.
              </td>
            </tr>
          )}
          {drafts.map((d, i) => (
            <tr key={`${d.canonicalName}-${i}`} className="border-t border-ink-100">
              <td className="px-3 py-2 text-ink-900">{d.label}</td>
              <td className="px-3 py-2">
                <CellInput
                  value={d.value}
                  onChange={(v) => update(i, { value: v })}
                  placeholder="value"
                />
              </td>
              <td className="px-3 py-2">
                <CellInput
                  value={d.unit}
                  onChange={(v) => update(i, { unit: v })}
                  width="w-20"
                />
              </td>
              <td className="px-3 py-2">
                <CellInput
                  value={d.refLow}
                  onChange={(v) => update(i, { refLow: v })}
                  width="w-16"
                />
              </td>
              <td className="px-3 py-2">
                <CellInput
                  value={d.refHigh}
                  onChange={(v) => update(i, { refHigh: v })}
                  width="w-16"
                />
              </td>
              <td className="px-2 py-2">
                <button
                  onClick={() => remove(i)}
                  className="text-ink-400 transition hover:text-red-500"
                  aria-label="remove marker"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {remainingOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-ink-50/50 px-3 py-3">
          <Plus className="h-3 w-3 text-ink-400" />
          <span className="text-xs text-ink-500">Add marker:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                add(e.target.value);
                e.target.value = "";
              }
            }}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-900 outline-none"
          >
            <option value="" disabled>
              Pick…
            </option>
            {remainingOptions.map((c) => (
              <option key={c.canonicalName} value={c.canonicalName}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function CellInput({
  value,
  onChange,
  placeholder,
  width = "w-24",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${width} rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-900 outline-none focus:border-ink-900`}
    />
  );
}

// ── History section ──────────────────────────────────────────────────

function HistorySection({
  reports,
  selectedId,
  onSelect,
}: {
  reports: Report[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400">
        <CheckCircle2 className="h-3 w-3" /> History
      </div>
      <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
        All reports
      </h2>
      <div className="mt-4 space-y-2">
        {reports.map((r, idx) => {
          const outOfRange = r.markers.filter(
            (m) => m.interpretation === "LOW" || m.interpretation === "HIGH",
          );
          const isCurrent = idx === 0;
          const isActive = r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-xs transition ${
                isActive
                  ? "border-accent-300 bg-accent-50/60"
                  : "border-ink-100 bg-white hover:border-ink-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-medium text-ink-900">
                    {fmtDate(r.createdAt)}
                  </div>
                  <div className="text-ink-500">
                    {r.markers.length} markers · {outOfRange.length} out of range
                    {r.recommendation
                      ? ` · readiness ${r.recommendation.readinessScore}`
                      : " · analyzing…"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isCurrent && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                    Current
                  </span>
                )}
                <span className="rounded bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-600">
                  {r.source === "PDF_UPLOAD" ? "PDF" : "Manual"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Small UI primitives ──────────────────────────────────────────────

function ReadinessRing({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, score));
  const tone =
    safe >= 75
      ? "text-emerald-500"
      : safe >= 50
        ? "text-amber-500"
        : "text-red-500";
  const circumference = 2 * Math.PI * 28;
  const dash = (safe / 100) * circumference;
  return (
    <div className="relative h-20 w-20">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="28"
          className="stroke-ink-100"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx="32"
          cy="32"
          r="28"
          className={`${tone} transition-[stroke-dasharray]`}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-semibold tracking-tight">
        {safe}
      </div>
    </div>
  );
}

function InterpretationPill({
  interpretation,
}: {
  interpretation: MarkerInterpretation;
}) {
  const { label, cls } = interpretationStyle(interpretation);
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

function CategoryBadge({
  category,
  tone,
}: {
  category: ClassCategory;
  tone: "good" | "avoid";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${cls}`}
    >
      {tone === "good" ? "✓" : "—"} {category}
    </span>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400">
      {icon}
      {children}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function interpretationStyle(i: MarkerInterpretation) {
  switch (i) {
    case "LOW":
      return { label: "Low", cls: "bg-red-50 text-red-700" };
    case "HIGH":
      return { label: "High", cls: "bg-red-50 text-red-700" };
    case "BORDERLINE_LOW":
      return { label: "Border L", cls: "bg-amber-50 text-amber-700" };
    case "BORDERLINE_HIGH":
      return { label: "Border H", cls: "bg-amber-50 text-amber-700" };
    case "NORMAL":
      return { label: "Normal", cls: "bg-emerald-50 text-emerald-700" };
    default:
      return { label: "—", cls: "bg-ink-100 text-ink-500" };
  }
}

function readinessLabel(score: number) {
  if (score >= 80) return "Ready to push";
  if (score >= 60) return "Moderate intensity ok";
  if (score >= 40) return "Go easy this week";
  return "Recovery first";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDraft(m: ExtractionPreviewMarker): DraftMarker {
  const def = MARKER_CATALOG.find((c) => c.canonicalName === m.canonicalName);
  return {
    canonicalName: m.canonicalName ?? "",
    label: def?.label ?? m.label,
    value: m.value != null ? String(m.value) : "",
    unit: m.unit ?? def?.unit ?? "",
    refLow: m.refLow != null ? String(m.refLow) : def ? String(def.refLow) : "",
    refHigh:
      m.refHigh != null ? String(m.refHigh) : def ? String(def.refHigh) : "",
  };
}

function draftsToPayload(drafts: DraftMarker[]) {
  const markers = [] as Array<{
    canonicalName: string;
    label: string;
    value: number;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
  }>;
  for (const d of drafts) {
    if (!d.canonicalName) continue;
    const value = parseFloat(d.value);
    if (!Number.isFinite(value)) continue;
    markers.push({
      canonicalName: d.canonicalName,
      label: d.label,
      value,
      unit: d.unit.trim() || "-",
      refLow: parseMaybeNumber(d.refLow),
      refHigh: parseMaybeNumber(d.refHigh),
    });
  }
  return { markers };
}

function parseMaybeNumber(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function defaultManualDrafts(): DraftMarker[] {
  // Seed the form with a sensible starter panel — user can add/remove.
  const starter = [
    "hemoglobin",
    "ferritin",
    "vitamin_d",
    "tsh",
    "glucose",
    "crp",
  ];
  return starter
    .map((name) => MARKER_CATALOG.find((c) => c.canonicalName === name))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      canonicalName: c.canonicalName,
      label: c.label,
      value: "",
      unit: c.unit,
      refLow: String(c.refLow),
      refHigh: String(c.refHigh),
    }));
}

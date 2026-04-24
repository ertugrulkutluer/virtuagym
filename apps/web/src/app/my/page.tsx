"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

interface MyBooking {
  id: string;
  status: string;
  waitlistPosition: number | null;
  showProbability: number | null;
  creditCost: number;
  class: { id: string; title: string; startsAt: string; durationMinutes: number };
}

const BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PROMOTED: "bg-sky-100 text-sky-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  CHECKED_IN: "bg-indigo-100 text-indigo-800",
  CANCELLED: "bg-slate-100 text-slate-600",
  NO_SHOW: "bg-rose-100 text-rose-800",
};

export default function MyPage() {
  const { token, ready, user } = useSession();
  const { confirm, Confirm } = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState<MyBooking[]>([]);

  const reload = async () => {
    if (!token) return;
    const data = await api.get<MyBooking[]>("/api/bookings/me", token);
    setRows(data);
  };

  useEffect(() => {
    if (ready && token) reload();
  }, [ready, token]);

  const cancel = async (row: MyBooking) => {
    const ok = await confirm({
      title: "Cancel booking?",
      description: `"${row.class.title}" on ${new Date(
        row.class.startsAt,
      ).toLocaleString()}.`,
      confirmLabel: "Cancel booking",
    });
    if (!ok) return;
    try {
      await api.del(`/api/bookings/${row.id}`, token);
      toast.success("Booking cancelled");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (ready && !user) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-sm text-slate-600">
        Sign in to see your bookings.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      {rows.length === 0 ? (
        <div className="mt-10 text-sm text-slate-500">No bookings yet.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <div className="font-medium">{b.class.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(b.class.startsAt).toLocaleString()} · {b.class.durationMinutes} min
                </div>
                {b.showProbability !== null && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    show prob: {(b.showProbability * 100).toFixed(0)}%
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[b.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {b.status.toLowerCase()}
                  {b.waitlistPosition !== null ? ` · #${b.waitlistPosition}` : ""}
                </span>
                {["ACTIVE", "PROMOTED", "WAITLISTED"].includes(b.status) && (
                  <button
                    onClick={() => cancel(b)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Confirm />
    </main>
  );
}

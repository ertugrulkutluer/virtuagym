"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Modal, ModalButton } from "@/components/modal";
import { useToast } from "@/components/toast";

interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  credits: number;
  cohort: string | null;
  tenureStart: string;
}

export default function AdminMembersPage() {
  const { token, user, ready } = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [grantFor, setGrantFor] = useState<MemberRow | null>(null);
  const [grantAmount, setGrantAmount] = useState(10);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const data = await api.get<{ items: MemberRow[] }>(
      `/api/members${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      token,
    );
    setRows(data.items);
  };

  useEffect(() => {
    if (ready && user?.role === "ADMIN") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user?.role]);

  const submitGrant = async () => {
    if (!grantFor) return;
    setBusy(true);
    try {
      const res = await api.post<{ balance: number }>(
        `/api/members/${grantFor.id}/credits`,
        { amount: grantAmount },
        token,
      );
      toast.success(
        `Granted ${grantAmount} to ${grantFor.firstName} → balance ${res.balance}`,
      );
      setGrantFor(null);
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reload()}
          placeholder="Search name or email…"
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => reload()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Search
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Cohort</th>
              <th className="px-4 py-2 text-left">Credits</th>
              <th className="px-4 py-2 text-left">Tenure (d)</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const tenureDays = Math.floor(
                (Date.now() - new Date(m.tenureStart).getTime()) / 86_400_000,
              );
              return (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {m.firstName} {m.lastName}
                  </td>
                  <td className="px-4 py-2">{m.email}</td>
                  <td className="px-4 py-2">{m.cohort ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">{m.credits}</td>
                  <td className="px-4 py-2">{tenureDays}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setGrantFor(m);
                        setGrantAmount(10);
                      }}
                      className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Grant credits
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!grantFor}
        onClose={() => setGrantFor(null)}
        title="Grant credits"
        description={
          grantFor
            ? `${grantFor.firstName} ${grantFor.lastName} · current ${grantFor.credits}`
            : undefined
        }
        footer={
          <>
            <ModalButton onClick={() => setGrantFor(null)}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              disabled={busy || grantAmount < 1}
              onClick={submitGrant}
            >
              {busy ? "…" : `Grant ${grantAmount}`}
            </ModalButton>
          </>
        }
      >
        <label className="block">
          <span className="text-xs text-slate-500">Amount</span>
          <input
            type="number"
            min={1}
            max={500}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </Modal>
    </main>
  );
}

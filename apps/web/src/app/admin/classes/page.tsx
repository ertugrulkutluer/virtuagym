"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

interface ClassRow {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  creditCost: number;
  cancelled: boolean;
  trainer: { name: string } | null;
  _count: { bookings: number };
}

export default function AdminClassesPage() {
  const { token, user, ready } = useSession();
  const toast = useToast();
  const { confirm, Confirm } = useConfirm();
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [form, setForm] = useState({
    title: "",
    startsAt: "",
    durationMinutes: 45,
    capacity: 10,
    creditCost: 1,
  });

  const reload = async () => {
    const list = await api.get<{ items: ClassRow[] }>(
      "/api/classes?includeCancelled=true",
      token,
    );
    setRows(list.items);
  };

  useEffect(() => {
    if (ready && user?.role === "ADMIN") reload();
  }, [ready, token, user?.role]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(
        "/api/classes",
        { ...form, startsAt: new Date(form.startsAt).toISOString() },
        token,
      );
      toast.success(`Created ${form.title}`);
      setForm({ ...form, title: "" });
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? String(err.body?.message ?? err.message)
          : String(err),
      );
    }
  };

  const cancel = async (c: ClassRow) => {
    const ok = await confirm({
      title: "Cancel class?",
      description: `${c.title} — existing bookings will stay in history.`,
      confirmLabel: "Cancel class",
    });
    if (!ok) return;
    try {
      await api.del(`/api/classes/${c.id}`, token);
      toast.success("Class cancelled");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>

      <form
        onSubmit={create}
        className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-6"
      >
        <Input
          label="Title"
          className="sm:col-span-2"
          value={form.title}
          setValue={(v) => setForm({ ...form, title: v })}
        />
        <Input
          label="Starts at"
          type="datetime-local"
          value={form.startsAt}
          setValue={(v) => setForm({ ...form, startsAt: v })}
        />
        <Input
          label="Minutes"
          type="number"
          value={String(form.durationMinutes)}
          setValue={(v) => setForm({ ...form, durationMinutes: Number(v) })}
        />
        <Input
          label="Capacity"
          type="number"
          value={String(form.capacity)}
          setValue={(v) => setForm({ ...form, capacity: Number(v) })}
        />
        <Input
          label="Credits"
          type="number"
          value={String(form.creditCost)}
          setValue={(v) => setForm({ ...form, creditCost: Number(v) })}
        />
        <div className="sm:col-span-6 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create class
          </button>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Starts</th>
              <th className="px-4 py-2 text-left">Cap</th>
              <th className="px-4 py-2 text-left">Booked</th>
              <th className="px-4 py-2 text-left">Credits</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {c.title}
                  {c.cancelled && (
                    <span className="ml-2 text-xs text-rose-600">cancelled</span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(c.startsAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">{c.capacity}</td>
                <td className="px-4 py-2">{c._count.bookings}</td>
                <td className="px-4 py-2">{c.creditCost}</td>
                <td className="px-4 py-2 text-right">
                  {!c.cancelled && (
                    <button
                      onClick={() => cancel(c)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Confirm />
    </main>
  );
}

function Input({
  label,
  type = "text",
  value,
  setValue,
  className,
}: {
  label: string;
  type?: string;
  value: string;
  setValue: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </label>
  );
}

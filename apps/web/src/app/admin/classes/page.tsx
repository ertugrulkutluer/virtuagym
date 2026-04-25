"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_CLASS_CATEGORIES, type ClassCategory } from "@gymflow/shared";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Modal, ModalButton } from "@/components/modal";

interface Trainer {
  id: string;
  name: string;
}

interface ClassRow {
  id: string;
  title: string;
  description: string | null;
  category: ClassCategory;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  creditCost: number;
  cancelled: boolean;
  location: string | null;
  trainer: { id: string; name: string } | null;
  _count: { bookings: number };
}

interface FormState {
  title: string;
  description: string;
  category: ClassCategory;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  creditCost: number;
  trainerId: string;
  location: string;
}

const blankForm: FormState = {
  title: "",
  description: "",
  category: "CARDIO",
  startsAt: "",
  durationMinutes: 45,
  capacity: 10,
  creditCost: 1,
  trainerId: "",
  location: "",
};

export default function AdminClassesPage() {
  const { token, user, ready } = useSession();
  const toast = useToast();
  const { confirm, Confirm } = useConfirm();
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [editForm, setEditForm] = useState<FormState>(blankForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const reload = async () => {
    // Default view: today + upcoming. Past classes hide unless explicitly
    // requested — otherwise the table fills with stale rows and pushes the
    // ones admins actually act on past pagination.
    const params = new URLSearchParams({
      includeCancelled: "true",
      take: String(pageSize),
      skip: String((page - 1) * pageSize),
    });
    if (!showPast) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      params.set("from", startOfToday.toISOString());
    }
    const [list, trainerList] = await Promise.all([
      api.get<{ items: ClassRow[]; total: number }>(
        `/api/classes?${params}`,
        token,
      ),
      api.get<Trainer[]>("/api/trainers", token),
    ]);
    setRows(list.items);
    setTotal(list.total);
    setTrainers(trainerList);
  };

  useEffect(() => {
    if (ready && user?.role === "ADMIN") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user?.role, showPast, page, pageSize]);

  // Reset to page 1 when filters change so we never request a skip past the
  // new total.
  useEffect(() => {
    setPage(1);
  }, [showPast, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(total, page * pageSize);

  const buildPayload = (f: FormState) => ({
    title: f.title,
    description: f.description.trim() || undefined,
    category: f.category,
    startsAt: new Date(f.startsAt).toISOString(),
    durationMinutes: f.durationMinutes,
    capacity: f.capacity,
    creditCost: f.creditCost,
    trainerId: f.trainerId || undefined,
    location: f.location.trim() || undefined,
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/classes", buildPayload(form), token);
      toast.success(`Created ${form.title}`);
      setForm({ ...blankForm, category: form.category });
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

  const openEdit = (c: ClassRow) => {
    setEditing(c);
    setEditForm({
      title: c.title,
      description: c.description ?? "",
      category: c.category,
      startsAt: toLocalInput(c.startsAt),
      durationMinutes: c.durationMinutes,
      capacity: c.capacity,
      creditCost: c.creditCost,
      trainerId: c.trainer?.id ?? "",
      location: c.location ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api.patch(
        `/api/classes/${editing.id}`,
        buildPayload(editForm),
        token,
      );
      toast.success("Class updated");
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? String(err.body?.message ?? err.message)
          : String(err),
      );
    } finally {
      setSavingEdit(false);
    }
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Show past classes
        </label>
      </div>

      <form
        onSubmit={create}
        className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-6"
      >
        <Input
          label="Title"
          className="sm:col-span-3"
          value={form.title}
          setValue={(v) => setForm({ ...form, title: v })}
        />
        <Select
          label="Category"
          className="sm:col-span-2"
          value={form.category}
          setValue={(v) => setForm({ ...form, category: v as ClassCategory })}
          options={ALL_CLASS_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <Select
          label="Trainer"
          className="sm:col-span-1"
          value={form.trainerId}
          setValue={(v) => setForm({ ...form, trainerId: v })}
          required={false}
          options={[
            { value: "", label: "—" },
            ...trainers.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Input
          label="Starts at"
          type="datetime-local"
          className="sm:col-span-2"
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
        <Input
          label="Location"
          className="sm:col-span-3"
          required={false}
          value={form.location}
          setValue={(v) => setForm({ ...form, location: v })}
        />
        <Textarea
          label="Description"
          className="sm:col-span-6"
          value={form.description}
          setValue={(v) => setForm({ ...form, description: v })}
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
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Trainer</th>
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
                <td className="px-4 py-2 text-xs text-slate-500">{c.category}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {c.trainer?.name ?? "—"}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(c.startsAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">{c.capacity}</td>
                <td className="px-4 py-2">{c._count.bookings}</td>
                <td className="px-4 py-2">{c.creditCost}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    {!c.cancelled && (
                      <button
                        onClick={() => cancel(c)}
                        className="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          {total === 0
            ? "No classes"
            : `Showing ${fromRow}–${toRow} of ${total}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              ‹ Prev
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              »
            </button>
          </div>
        </div>
      </div>

      <Confirm />

      <Modal
        open={Boolean(editing)}
        title={editing ? `Edit · ${editing.title}` : "Edit class"}
        onClose={() => (savingEdit ? undefined : setEditing(null))}
        footer={
          <>
            <ModalButton onClick={() => setEditing(null)} disabled={savingEdit}>
              Close
            </ModalButton>
            <ModalButton
              variant="primary"
              onClick={saveEdit}
              disabled={savingEdit}
            >
              {savingEdit ? "Saving…" : "Save"}
            </ModalButton>
          </>
        }
      >
        <EditFields
          form={editForm}
          setForm={setEditForm}
          trainers={trainers}
        />
      </Modal>
    </main>
  );
}

function EditFields({
  form,
  setForm,
  trainers,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  trainers: Trainer[];
}) {
  const trainerOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...trainers.map((t) => ({ value: t.id, label: t.name })),
    ],
    [trainers],
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label="Title"
        className="sm:col-span-2"
        value={form.title}
        setValue={(v) => setForm({ ...form, title: v })}
      />
      <Select
        label="Category"
        value={form.category}
        setValue={(v) => setForm({ ...form, category: v as ClassCategory })}
        options={ALL_CLASS_CATEGORIES.map((c) => ({ value: c, label: c }))}
      />
      <Select
        label="Trainer"
        value={form.trainerId}
        setValue={(v) => setForm({ ...form, trainerId: v })}
        required={false}
        options={trainerOptions}
      />
      <Input
        label="Starts at"
        type="datetime-local"
        className="sm:col-span-2"
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
      <Input
        label="Location"
        required={false}
        value={form.location}
        setValue={(v) => setForm({ ...form, location: v })}
      />
      <Textarea
        label="Description"
        className="sm:col-span-2"
        value={form.description}
        setValue={(v) => setForm({ ...form, description: v })}
      />
    </div>
  );
}

function Input({
  label,
  type = "text",
  value,
  setValue,
  className,
  required = true,
}: {
  label: string;
  type?: string;
  value: string;
  setValue: (v: string) => void;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </label>
  );
}

function Select({
  label,
  value,
  setValue,
  options,
  className,
  required = true,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  value,
  setValue,
  className,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </label>
  );
}

function toLocalInput(iso: string): string {
  // Convert an ISO timestamp into a value the <input type="datetime-local">
  // control accepts (YYYY-MM-DDTHH:mm in local time).
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Variant = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
}

interface ToastApi {
  show: (message: string, variant?: Variant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: Variant = "info") => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, message, variant }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
    }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const tone =
    item.variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : item.variant === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-slate-200 bg-white text-slate-800";
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${tone}`}
      role="status"
    >
      <span className="flex-1">{item.message}</span>
      <button
        onClick={onClose}
        className="text-xs text-slate-500 hover:text-slate-900"
        aria-label="dismiss"
      >
        ×
      </button>
    </div>
  );
}

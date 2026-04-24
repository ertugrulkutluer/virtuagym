"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold">{title}</div>
          {description && (
            <div className="mt-1 text-xs text-slate-500">{description}</div>
          )}
        </div>
        {children && <div className="px-5 py-4 text-sm">{children}</div>}
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalButton({
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
}) {
  const base =
    "rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50";
  const tone =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : "border border-slate-300 text-slate-700 hover:bg-slate-50";
  return <button {...props} className={`${base} ${tone} ${props.className ?? ""}`} />;
}

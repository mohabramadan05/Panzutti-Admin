"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button, ErrorNote } from "./ui";

/** Centered dialog. Esc and clicking the backdrop close it. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/50 p-4 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`my-8 w-full rounded-2xl bg-card shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl text-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** "Are you sure?" for destructive actions — never a browser confirm(). */
export function ConfirmDelete({
  title,
  message,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex gap-3">
        <AlertTriangle className="h-6 w-6 shrink-0 text-brand-red" aria-hidden />
        <div className="text-sm">{message}</div>
      </div>
      <div className="mt-4">
        <ErrorNote message={error ?? ""} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Keep it</Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>Delete</Button>
      </div>
    </Modal>
  );
}

/** Label + control + optional hint, used by every editor form. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

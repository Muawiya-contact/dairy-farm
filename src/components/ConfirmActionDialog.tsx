"use client";

import { useEffect, useId, useRef } from "react";
import { UI_TEXT } from "@/lib/text";

export function ConfirmActionDialog({ title, message, confirmLabel, busy = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => { if (busy) dialogRef.current?.focus(); }, [busy]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onCancel();
  }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-busy={busy} tabIndex={-1}
      aria-labelledby={titleId} aria-describedby={messageId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); }
        if (event.key === "Tab" && busy) event.preventDefault();
        else if (event.key === "Tab") {
          if (event.shiftKey && document.activeElement === cancelRef.current) {
            event.preventDefault(); confirmRef.current?.focus();
          } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
            event.preventDefault(); cancelRef.current?.focus();
          }
        }
      }}
      className="w-full max-w-md rounded-2xl bg-paper p-5 shadow-xl">
      <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
      <p id={messageId} className="mt-3 text-sm text-muted">{message}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}
          className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">{UI_TEXT.cancelAction}</button>
        <button ref={confirmRef} type="button" disabled={busy} onClick={onConfirm}
          className="min-h-11 rounded-xl bg-udhaar px-4 font-bold text-white disabled:opacity-50">{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

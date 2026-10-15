"use client";

import { useEffect, useId, useRef } from "react";
import { UI_TEXT } from "@/lib/text";

export function ConfirmActionDialog({ title, message, confirmLabel, busy = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onCancel();
  }}>
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); } }}
      className="w-full max-w-md rounded-2xl bg-paper p-5 shadow-xl">
      <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
      <p id={messageId} className="mt-3 text-sm text-muted">{message}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}
          className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">{UI_TEXT.cancelAction}</button>
        <button type="button" disabled={busy} onClick={onConfirm}
          className="min-h-11 rounded-xl bg-udhaar px-4 font-bold text-white disabled:opacity-50">{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

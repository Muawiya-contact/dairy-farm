"use client";

import { useEffect, useId, useRef } from "react";

/** Makes a failed write visible without hiding the form needed to correct it. */
export function SaveErrorDialog({ error, onClose, title = "Save nahi hua" }: {
  error: string;
  onClose: () => void;
  title?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      className="w-full max-w-md rounded-2xl bg-paper p-5 shadow-xl">
      <h2 id={titleId} className="font-display text-xl font-bold text-udhaar">{title}</h2>
      <div id={descriptionId} className="mt-3 text-sm text-ink">
        <p>{error}</p>
        <p className="mt-2 text-muted">Form check karke dobara Save karein. Agar connection tootne ka shak ho to pehle neeche register/list mein entry check karein.</p>
      </div>
      <div className="mt-5 flex justify-end">
        <button ref={closeRef} type="button" onClick={onClose}
          className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white">Theek hai</button>
      </div>
    </section>
  </div>;
}

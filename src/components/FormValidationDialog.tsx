"use client";

import { useEffect, useId, useRef } from "react";

/** A non-destructive, keyboard-safe explanation for a blocked form save. */
export function FormValidationDialog({ title, problems, onClose }: {
  title: string;
  problems: readonly string[];
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      className="w-full max-w-md rounded-2xl bg-paper p-5 shadow-xl">
      <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
      <div id={descriptionId} className="mt-3 text-sm text-muted">
        <p>Save karne se pehle yeh cheezein durust karein:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
      </div>
      <div className="mt-5 flex justify-end">
        <button ref={closeRef} type="button" onClick={onClose}
          className="min-h-11 rounded-xl bg-berseem px-4 font-bold text-white">Theek hai, durust karta hoon</button>
      </div>
    </section>
  </div>;
}

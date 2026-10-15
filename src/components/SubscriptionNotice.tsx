"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSubscriptionStatus, subscriptionMessage } from "@/lib/subscription";

export default function SubscriptionNotice({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  const status = useQuery({ queryKey: ["subscription-status"], queryFn: getSubscriptionStatus,
    staleTime: 60_000, refetchInterval: 60_000 });
  const message = status.data ? subscriptionMessage(status.data) : null;
  const readOnly = status.data?.read_only === true;

  return <>
    {message && !dismissed && <section role="status" aria-label="Saalana fee yaad dehani" className="mx-4 mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:mx-6">
      <div className="flex items-start justify-between gap-3">
        <div><strong className="block">{readOnly ? "Muddat khatam" : "Saalana fee yaad dehani"}</strong><p className="mt-1 text-sm">{message}</p></div>
        <button type="button" aria-label="Yaad dehani band karein" title="Band karein" onClick={() => setDismissed(true)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400 bg-white text-xl" >×</button>
      </div>
    </section>}
    {readOnly && dismissed && <p role="status" className="mx-4 mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-950 sm:mx-6">Saalana muddat khatam · Sirf data dekh sakte hain.</p>}
    <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">{children}</fieldset>
  </>;
}

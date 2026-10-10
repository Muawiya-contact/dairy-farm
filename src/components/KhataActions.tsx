"use client";

import { useState } from "react";
import { CheckIcon, CloseIcon, PlusIcon, ShareIcon } from "./icons";

type Props = { name: string; phone: string; balance: number; billText: string };
const rsf = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

export default function KhataActions({ name, phone, balance, billText }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "bank" | "easypaisa">("cash");
  const [received, setReceived] = useState(0);

  const intl = "92" + phone.replace(/\D/g, "").replace(/^0/, "");
  const waLink = `https://wa.me/${intl}?text=${encodeURIComponent(billText)}`;
  const left = balance - received;

  return (
    <div className="grid gap-3">
      {received > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-berseem-soft px-4 py-3 text-[15px] text-berseem-deep" role="status">
          <CheckIcon /> {rsf(received)} wusool. Ab baqi {rsf(left)}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen(true)} className="flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl bg-berseem font-semibold text-white hover:bg-berseem-deep">
          <PlusIcon width={18} height={18} />Wusooli likhein
        </button>
        <a href={waLink} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-berseem font-semibold text-berseem hover:bg-berseem-soft">
          <ShareIcon width={18} height={18} />WhatsApp bill
        </a>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-paper p-5 pb-8 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 id="pay-title" className="font-display text-xl font-bold">{name} se wusooli</h2>
              <button aria-label="Band karein" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ground"><CloseIcon /></button>
            </div>
            <label className="mt-4 block text-[14px] font-semibold text-muted" htmlFor="amt">Raqam</label>
            <div className="mt-1 flex items-center gap-2 border-b-[3px] border-berseem">
              <span className="text-xl font-semibold text-muted">Rs</span>
              <input id="amt" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className="w-0 min-w-0 flex-1 bg-transparent py-1 font-display text-[40px] font-extrabold tnum outline-none" />
            </div>
            <button onClick={() => setAmount(String(left))} className="mt-2 text-[14px] font-semibold text-berseem underline underline-offset-4">Poora baqaya: {rsf(left)}</button>
            <fieldset className="mt-4">
              <legend className="text-[14px] font-semibold text-muted">Kaise mili</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["cash", "bank", "easypaisa"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`min-h-[44px] rounded-xl border text-[14px] font-semibold ${mode === m ? "border-ink bg-ink text-white" : "border-line"}`}>
                    {m === "cash" ? "Cash" : m === "bank" ? "Bank" : "Easypaisa"}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              disabled={!Number(amount)}
              onClick={() => { setReceived((r) => r + Number(amount)); setAmount(""); setOpen(false); }}
              className="mt-6 min-h-[54px] w-full rounded-2xl bg-berseem text-[17px] font-bold text-white disabled:opacity-40"
            >
              Wusooli save karein
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { animals, customers, COLLECTION_CENTER_RATE, HOME_USE_PER_SHIFT } from "@/lib/mock-data";
import { isGivingMilk } from "@/lib/calc";
import { CheckIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon } from "./icons";

type Shift = "morning" | "evening";
const milkers = animals.filter(isGivingMilk);
const usualFor = (s: Shift) => Object.fromEntries(customers.map((c) => [c.id, s === "morning" ? c.morning : c.evening]));
const perAnimalFor = (s: Shift) =>
  Object.fromEntries(milkers.map((a) => [a.id, Math.round(a.last7[6] * (s === "morning" ? 0.54 : 0.46) * 2) / 2]));

const rsf = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

export default function MilkEntry() {
  const [shift, setShift] = useState<Shift>("morning");
  const [mode, setMode] = useState<"total" | "animal">("total");
  const [total, setTotal] = useState<string>("46");
  const [perAnimal, setPerAnimal] = useState<Record<string, number>>(perAnimalFor("morning"));
  const [qty, setQty] = useState<Record<string, number>>(usualFor("morning"));
  const [saved, setSaved] = useState(false);

  const switchShift = (s: Shift) => {
    setShift(s);
    setQty(usualFor(s));
    setPerAnimal(perAnimalFor(s));
    setTotal(s === "morning" ? "46" : "38.5");
    setSaved(false);
  };

  const milkTotal = mode === "total" ? Number(total) || 0 : Object.values(perAnimal).reduce((s, x) => s + x, 0);
  const toCustomers = Object.values(qty).reduce((s, x) => s + x, 0);
  const center = Math.max(0, milkTotal - toCustomers - HOME_USE_PER_SHIFT);
  const short = milkTotal - toCustomers - HOME_USE_PER_SHIFT < 0;
  const sale = useMemo(
    () => customers.reduce((s, c) => s + (qty[c.id] ?? 0) * c.rate, 0) + center * COLLECTION_CENTER_RATE,
    [qty, center],
  );
  const changed = customers.filter((c) => qty[c.id] !== (shift === "morning" ? c.morning : c.evening)).length;

  const step = (id: string, d: number) => { setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) })); setSaved(false); };
  const stepAnimal = (id: string, d: number) => { setPerAnimal((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) })); setSaved(false); };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start">
      <div className="grid gap-4">
        <div role="tablist" aria-label="Shift" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#e4e8df] p-1">
          {(["morning", "evening"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={shift === s}
              onClick={() => switchShift(s)}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-[17px] font-bold ${shift === s ? "bg-paper text-ink shadow-[0_1px_0_#d9dfd4]" : "text-muted"}`}
            >
              {s === "morning" ? <SunIcon /> : <MoonIcon />}
              {s === "morning" ? "Subah" : "Shaam"}
            </button>
          ))}
        </div>

        <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-[17px] font-bold">Kitna doodh nikla?</h2>
            <div className="flex rounded-lg bg-ground p-0.5 text-[13px] font-semibold">
              <button onClick={() => setMode("total")} aria-pressed={mode === "total"} className={`min-h-[34px] rounded-md px-2.5 ${mode === "total" ? "bg-paper text-ink" : "text-muted"}`}>Kul</button>
              <button onClick={() => setMode("animal")} aria-pressed={mode === "animal"} className={`min-h-[34px] rounded-md px-2.5 ${mode === "animal" ? "bg-paper text-ink" : "text-muted"}`}>Har janwar</button>
            </div>
          </div>

          {mode === "total" ? (
            <label className="mt-3 flex items-baseline gap-2">
              <span className="sr-only">Kul doodh litre mein</span>
              <input
                value={total}
                onChange={(e) => { setTotal(e.target.value.replace(/[^0-9.]/g, "")); setSaved(false); }}
                inputMode="decimal"
                className="w-40 border-b-[3px] border-berseem bg-transparent font-display text-[52px] font-extrabold leading-none tnum outline-none"
              />
              <span className="text-xl font-semibold text-muted">litre</span>
            </label>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {milkers.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <span className="w-14 font-display font-bold">{a.id}</span>
                  <span className="flex-1 text-[14px] text-muted">{a.breed}</span>
                  <button aria-label={`${a.id} kam`} onClick={() => stepAnimal(a.id, -0.5)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line"><MinusIcon width={18} height={18} /></button>
                  <span className="w-12 text-center text-lg font-bold tnum">{perAnimal[a.id]}</span>
                  <button aria-label={`${a.id} zyada`} onClick={() => stepAnimal(a.id, 0.5)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line"><PlusIcon width={18} height={18} /></button>
                </li>
              ))}
              <li className="flex justify-between pt-3 font-bold"><span>Kul</span><span className="tnum">{milkTotal} litre</span></li>
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-berseem-deep p-4 text-white sm:p-5" aria-live="polite">
          <dl className="grid grid-cols-3 gap-3">
            <div><dt className="text-[13px] text-[#cfe3cf]">Customers</dt><dd className="font-display text-[22px] font-bold tnum">{toCustomers} L</dd></div>
            <div><dt className="text-[13px] text-[#cfe3cf]">Center ko</dt><dd className="font-display text-[22px] font-bold tnum">{center} L</dd></div>
            <div><dt className="text-[13px] text-[#cfe3cf]">Ghar / zaaya</dt><dd className="font-display text-[22px] font-bold tnum">{HOME_USE_PER_SHIFT} L</dd></div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-white/15 pt-3">
            <span className="text-[#cfe3cf]">Is shift ki sale</span>
            <span className="font-display text-[28px] font-extrabold tnum">{rsf(sale)}</span>
          </div>
          {short && <p className="mt-2 rounded-lg bg-udhaar px-3 py-2 text-[14px]">Customers ko diya gaya doodh, nikle hue doodh se zyada hai. Miqdaar check karein.</p>}
        </section>

        <button
          onClick={() => setSaved(true)}
          disabled={short}
          className="hidden min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-berseem text-[18px] font-bold text-white hover:bg-berseem-deep disabled:opacity-50 lg:flex"
        >
          {saved ? <><CheckIcon /> Entry save ho gayi</> : "Entry save karein"}
        </button>
      </div>

      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-bold">Customers ko diya</h2>
            <p className="text-[14px] text-muted">{changed === 0 ? "Sab ko roz jitna" : `${changed} customer ki miqdaar badli`}</p>
          </div>
          <button
            onClick={() => { setQty(usualFor(shift)); setSaved(false); }}
            disabled={changed === 0}
            className="min-h-[42px] rounded-xl bg-berseem-soft px-3 text-[14px] font-semibold text-berseem-deep disabled:opacity-50"
          >
            Sab roz jaisa
          </button>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {customers.map((c) => {
            const usual = shift === "morning" ? c.morning : c.evening;
            const v = qty[c.id] ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-[14px] text-muted">Rs {c.rate}/L{usual ? `, roz ${usual} L` : ", is waqt nahi leta"}</p>
                </div>
                <button aria-label={`${c.name} ko kam`} onClick={() => step(c.id, -1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line hover:border-muted"><MinusIcon /></button>
                <span className={`w-10 text-center font-display text-[20px] font-bold tnum ${v !== usual ? "text-haldi-ink" : ""}`}>{v}</span>
                <button aria-label={`${c.name} ko zyada`} onClick={() => step(c.id, 1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line hover:border-muted"><PlusIcon /></button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Phone: save button stays above the bottom menu */}
      <div className="sticky bottom-[86px] z-10 lg:hidden">
        <button
          onClick={() => setSaved(true)}
          disabled={short}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-berseem text-[18px] font-bold text-white shadow-[0_6px_20px_-8px_rgba(29,70,38,.6)] disabled:opacity-50"
        >
          {saved ? <><CheckIcon /> Entry save ho gayi</> : "Entry save karein"}
        </button>
      </div>
    </div>
  );
}

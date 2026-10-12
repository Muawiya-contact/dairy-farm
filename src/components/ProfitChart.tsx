"use client";

import { useState } from "react";

type Bar = { label: string; value: number; note?: string };
type Props = {
  daily: Bar[];
  monthly: Bar[];
  year: { sales: number; expenses: number; label: string };
  dailyLabel: string;
  monthlyLabel: string;
};

const fmt = (n: number) => `${n < 0 ? "− " : "+ "}Rs ${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
const short = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 100000 ? `${(a / 100000).toFixed(1)} lakh` : `${Math.round(a / 1000)}k`;
  return (n < 0 ? "−" : "") + s;
};

const TABS = [
  { key: "daily", label: "Roz" },
  { key: "monthly", label: "Mahana" },
  { key: "year", label: "Saalana" },
] as const;

export default function ProfitChart({ daily, monthly, year, dailyLabel, monthlyLabel }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("monthly");
  const bars = tab === "daily" ? daily : monthly;
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const hasNeg = bars.some((b) => b.value < 0);
  const total = bars.reduce((s, b) => s + b.value, 0);

  return (
    <section className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold">Munafa / nuqsaan</h2>
        <div role="tablist" aria-label="Period" className="flex rounded-xl bg-ground p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-[38px] rounded-lg px-3.5 text-[14px] font-semibold ${tab === t.key ? "bg-paper text-ink shadow-[0_1px_0_#d9dfd4]" : "text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "year" ? (
        <div className="mt-5">
          <div className="text-[14px] text-muted">{year.label}</div>
          <div className="font-display text-[40px] font-extrabold leading-none text-berseem tnum">{fmt(year.sales - year.expenses)}</div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div><dt className="text-[14px] text-muted">Kul sale</dt><dd className="text-lg font-bold tnum">Rs {Math.round(year.sales).toLocaleString("en-IN")}</dd></div>
            <div><dt className="text-[14px] text-muted">Kul kharcha</dt><dd className="text-lg font-bold tnum">Rs {Math.round(year.expenses).toLocaleString("en-IN")}</dd></div>
          </dl>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[14px] text-muted">{tab === "daily" ? dailyLabel : monthlyLabel}</span>
            <span className={`font-bold tnum ${total < 0 ? "text-udhaar" : "text-berseem"}`}>{fmt(total)}</span>
          </div>
          <div className="relative mt-3 flex h-40 items-stretch gap-[6px]" aria-label="Profit chart">
            {bars.map((b, i) => {
              const h = (Math.abs(b.value) / max) * (hasNeg ? 50 : 100);
              const neg = b.value < 0;
              const last = i === bars.length - 1;
              return (
                <div key={b.label} className="group relative flex flex-1 flex-col" title={`${b.label}: ${fmt(b.value)}${b.note ? ` (${b.note})` : ""}`}>
                  <div className={`flex flex-col ${hasNeg ? "h-1/2" : "h-full"} justify-end`}>
                    {!neg && <div className={`fill-rise origin-bottom rounded-t-[5px] ${last ? "bg-berseem" : "bg-[#a9c8a6]"}`} style={{ height: `${h * (hasNeg ? 2 : 1)}%` }} />}
                  </div>
                  {hasNeg && (
                    <div className="flex h-1/2 flex-col justify-start border-t border-ink/30">
                      {neg && <div className="rounded-b-[5px] bg-udhaar/80" style={{ height: `${h * 2}%` }} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-[6px]">
            {bars.map((b) => (
              <span key={b.label} className="flex-1 text-center text-[12px] text-muted">{b.label}</span>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted">
            {bars.length === 0 ? "Abhi koi entry nahi." : tab === "daily"
              ? "Laal bar = us din kharcha zyada hua."
              : `Sab se acha maheena: ${[...bars].sort((a, b) => b.value - a.value)[0].label}, ${short([...bars].sort((a, b) => b.value - a.value)[0].value)} munafa.`}
          </p>
        </>
      )}
    </section>
  );
}

import Link from "next/link";
import { OWNER_NAME, TODAY, farmMilk } from "@/lib/mock-data";
import {
  alerts, dayExpenses, daySales, dayName, herdCounts, longDate, num, rs, shiftSummary, yearSeries, shortDate,
} from "@/lib/calc";
import ProfitChart from "@/components/ProfitChart";
import { Body, Demo, Panel } from "@/components/ui";
import { BellIcon, PlusIcon } from "@/components/icons";

export default function Dashboard() {
  const m = shiftSummary(TODAY, "morning");
  const e = shiftSummary(TODAY, "evening");
  const totalMilk = m.total + e.total;
  const yesterday = farmMilk[farmMilk.length - 2];
  const diff = totalMilk - (yesterday.morning + yesterday.evening);
  const sales = daySales(TODAY);
  const spend = dayExpenses(TODAY);
  const herd = herdCounts();
  const series = yearSeries();
  const tones = { haldi: "bg-haldi", udhaar: "bg-udhaar", neel: "bg-neel" } as const;

  // Can fill: morning at the bottom, evening on top
  const CAN_MAX = 100;
  const mPct = (m.total / CAN_MAX) * 100;
  const ePct = (e.total / CAN_MAX) * 100;

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-8">
        <div>
          <p className="text-[15px] text-muted">{dayName(TODAY)}, {longDate(TODAY)}</p>
          <h1 className="font-display text-[24px] font-bold leading-tight lg:text-[30px]">Assalam o Alaikum, {OWNER_NAME}</h1>
        </div>
        <a href="#alerts" aria-label={`${alerts().length} alerts`} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-paper">
          <BellIcon />
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-udhaar px-1 text-[11px] font-bold text-white">{alerts().length}</span>
        </a>
      </header>

      <Body className="mt-2 grid gap-4 lg:grid-cols-3">
        {/* The one bold thing: today's milk, shown as a filling can */}
        <section className="rounded-3xl bg-berseem-deep p-5 text-white lg:col-span-2 lg:p-7">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] text-[#cfe3cf]">Aaj ka doodh</p>
              <p className="font-display text-[64px] font-extrabold leading-[0.95] tracking-[-0.03em] tnum lg:text-[84px]">
                {totalMilk}
                <span className="ml-2 text-[24px] font-bold tracking-normal text-[#cfe3cf] lg:text-[28px]">litre</span>
              </p>
              <p className="mt-2 text-[15px] text-[#cfe3cf]">
                Kal se {Math.abs(diff)} litre {diff < 0 ? "kam" : "zyada"}
              </p>
              <dl className="mt-5 flex gap-6">
                <div>
                  <dt className="flex items-center gap-2 text-[14px] text-[#cfe3cf]"><span className="h-2.5 w-2.5 rounded-sm bg-[#f4f1e6]" />Subah</dt>
                  <dd className="font-display text-[24px] font-bold tnum">{m.total} L</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-2 text-[14px] text-[#cfe3cf]"><span className="h-2.5 w-2.5 rounded-sm bg-haldi" />Shaam</dt>
                  <dd className="font-display text-[24px] font-bold tnum">{e.total} L</dd>
                </div>
              </dl>
            </div>
            <div aria-hidden="true" className="flex shrink-0 flex-col items-center">
              <div className="h-3 w-10 rounded-t-md bg-[#3c7a48]" />
              <div className="relative flex h-40 w-20 flex-col justify-end overflow-hidden rounded-b-2xl rounded-t-[28px] bg-[#2a5c33] lg:h-52 lg:w-28">
                <div className="fill-rise origin-bottom bg-haldi" style={{ height: `${ePct}%` }} />
                <div className="fill-rise origin-bottom bg-[#f4f1e6]" style={{ height: `${mPct}%` }} />
              </div>
            </div>
          </div>
        </section>

        <Panel title="Aaj ka hisaab">
          <dl className="divide-y divide-line">
            <div className="flex items-baseline justify-between py-2.5"><dt className="text-muted">Sale</dt><dd className="text-lg font-bold tnum">{rs(sales)}</dd></div>
            <div className="flex items-baseline justify-between py-2.5"><dt className="text-muted">Kharcha</dt><dd className="text-lg font-bold tnum">{rs(spend)}</dd></div>
            <div className="flex items-baseline justify-between py-2.5"><dt className="font-semibold">Munafa</dt><dd className={`font-display text-[26px] font-extrabold tnum ${sales - spend < 0 ? "text-udhaar" : "text-berseem"}`}>{rs(sales - spend)}</dd></div>
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/doodh/" className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-berseem font-semibold text-white hover:bg-berseem-deep"><PlusIcon width={18} height={18} />Doodh</Link>
            <Link href="/kharcha/" className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-berseem font-semibold text-berseem hover:bg-berseem-soft"><PlusIcon width={18} height={18} />Kharcha</Link>
          </div>
        </Panel>

        <div className="lg:col-span-2">
          <ProfitChart
            daily={farmMilk.map((f) => ({ label: String(Number(f.date.slice(8))), value: daySales(f.date) - dayExpenses(f.date), note: shortDate(f.date) }))}
            monthly={series.map((s) => ({ label: s.month, value: s.profit }))}
            year={{ label: "2026, January se aaj tak", sales: series.reduce((a, s) => a + s.sales, 0), expenses: series.reduce((a, s) => a + s.expenses, 0) }}
          />
        </div>

        <div className="grid gap-4">
          <Panel title={`Janwar (${herd.total})`} aside={<Link href="/janwar/" className="text-[14px] font-semibold text-berseem underline-offset-4 hover:underline">Sab dekhein</Link>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div><dt className="text-[14px] text-muted">Doodh de rahe</dt><dd className="font-display text-2xl font-bold tnum">{herd.milking}</dd></div>
              <div><dt className="text-[14px] text-muted">Gaabhan</dt><dd className="font-display text-2xl font-bold tnum">{herd.pregnant}</dd></div>
              <div><dt className="text-[14px] text-muted">Khushk</dt><dd className="font-display text-2xl font-bold tnum">{herd.dry}</dd></div>
              <div><dt className="text-[14px] text-muted">Bachay</dt><dd className="font-display text-2xl font-bold tnum">{herd.calf}</dd></div>
            </dl>
          </Panel>

          <section id="alerts" className="scroll-mt-4 rounded-2xl border border-line bg-paper p-4 sm:p-5">
            <h2 className="mb-2 font-display text-[17px] font-bold">Tawajju dein</h2>
            <ul className="divide-y divide-line">
              {alerts().map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="flex items-start gap-3 py-3 text-[15px] leading-snug hover:text-berseem">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tones[a.tone]}`} />
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="text-[13px] text-muted lg:col-span-3">
          Aaj {num(m.toCustomers + e.toCustomers)} litre customers ko gaya, {num(m.center + e.center)} litre collection center ko.
        </p>
      </Body>
      <Demo />
    </>
  );
}

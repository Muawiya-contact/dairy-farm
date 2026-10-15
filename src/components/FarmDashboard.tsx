"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { amount, longDate, money, shortDate, useFarmData } from "@/lib/farm-data";
import { addDays, monthStart } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { litres } from "@/lib/format";
import { sumMilkLitres, remainingMilk } from "@/lib/milk-entry";
import { getMonthLocks, shouldRemindCloseMonth } from "@/lib/month-close";
import { Body, Panel } from "./ui";
import { BellIcon, PlusIcon } from "./icons";
import MilkCan from "./MilkCan";
import ProfitChart from "./ProfitChart";
import { FarmObservances } from "./FarmObservances";

export function FarmLoading({ error, retry }: { error?: Error | null; retry?: () => void }) {
  return <Body className="py-8"><div role={error ? "alert" : "status"} className="rounded-2xl border border-line bg-paper p-5 text-muted">
    {error ? <>Supabase se data nahi mila: {friendlyError(error)} <button onClick={retry} className="font-semibold text-berseem underline">Dobara koshish</button></> : "Supabase se data load ho raha hai…"}
  </div></Body>;
}

function MonthCloseReminder({ today, goLiveDate }: { today: string; goLiveDate: string }) {
  const locks = useQuery({ queryKey: ["month-locks"], queryFn: getMonthLocks, enabled: shouldRemindCloseMonth(today, [], goLiveDate) });
  if (locks.isError) return <p role="alert" className="rounded-2xl border border-line bg-paper p-4 text-sm lg:col-span-3">Band maheenay check nahi huay: {friendlyError(locks.error)} <button onClick={() => void locks.refetch()} className="font-semibold text-berseem underline">Dobara koshish</button></p>;
  if (!locks.data || !shouldRemindCloseMonth(today, locks.data, goLiveDate)) return null;
  return <p className="rounded-2xl border border-line bg-paper p-4 text-sm lg:col-span-3">Pichhla maheena abhi khula hai. Hisaab milane ke baad <Link href="/settings/" className="font-semibold text-berseem underline">Settings mein band karein</Link>.</p>;
}

export default function FarmDashboard() {
  const query = useFarmData("dashboard");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const shifts = d.shifts.filter((s) => s.milk_date === d.today);
  const morning = amount(shifts.find((s) => s.shift === "morning")?.total_litres);
  const evening = amount(shifts.find((s) => s.shift === "evening")?.total_litres);
  const yDate = addDays(d.today, -1);
  const yMilk = sumMilkLitres(d.shifts.filter((s) => s.milk_date === yDate).map((s) => amount(s.total_litres)));
  const todayMilk = sumMilkLitres([morning, evening]);
  const sale = d.deliveries.filter((x) => x.delivery_date === d.today).reduce((n, x) => n + amount(x.amount), 0)
    + d.companyBills.filter((x) => x.to_date === d.today).reduce((n, x) => n + amount(x.amount), 0)
    + d.otherIncome.filter((x) => x.income_date === d.today).reduce((n, x) => n + amount(x.amount), 0);
  const expense = d.expenses.filter((x) => x.expense_date === d.today && d.categories.find((c) => c.id === x.category_id)?.is_farm_cost).reduce((n, x) => n + amount(x.amount), 0);
  const active = d.animals.filter((a) => a.life_status === "active");
  const firstDay = monthStart(d.today);
  const days = Array.from({ length: Number(d.today.slice(8)) }, (_, i) => `${d.today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
  const daily = days.map((date) => ({ label: String(Number(date.slice(8))), note: shortDate(date), value:
    d.deliveries.filter((x) => x.delivery_date === date).reduce((n, x) => n + amount(x.amount), 0)
    + d.companyBills.filter((x) => x.to_date === date).reduce((n, x) => n + amount(x.amount), 0)
    + d.otherIncome.filter((x) => x.income_date === date).reduce((n, x) => n + amount(x.amount), 0)
    - d.expenses.filter((x) => x.expense_date === date && d.categories.find((c) => c.id === x.category_id)?.is_farm_cost).reduce((n, x) => n + amount(x.amount), 0),
  }));
  const monthly = d.monthlyPnl.map((x) => ({ label: longDate(x.month).split(" ")[1], value: amount(x.data?.profit) }));
  const yearSales = d.monthlyPnl.reduce((n, x) => n + amount(x.data?.total_income), 0);
  const yearExpenses = d.monthlyPnl.reduce((n, x) => n + amount(x.data?.farm_expenses), 0);
  const delivered = sumMilkLitres(d.deliveries.filter((x) => x.delivery_date === d.today).map((x) => amount(x.litres)));
  return <>
    <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-8">
      <div><p className="text-[15px] text-muted">{longDate(d.today)}</p><h1 className="font-display text-[24px] font-bold leading-tight lg:text-[30px]">Assalam o Alaikum, {d.settings.owner_name || "Maalik"}</h1></div>
      <a href="#alerts" aria-label={`${d.alerts.length} alerts`} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-paper"><BellIcon /><span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-udhaar px-1 text-[11px] font-bold text-white">{d.alerts.length}</span></a>
    </header>
    <Body className="mt-2 grid gap-4 lg:grid-cols-3">
      <FarmObservances today={d.today} settings={d.settings} className="lg:col-span-3" />
      <MonthCloseReminder today={d.today} goLiveDate={d.settings.go_live_date} />
      <section className="rounded-3xl bg-berseem-deep p-5 text-white lg:col-span-2 lg:p-7"><div className="flex items-end justify-between gap-4"><div className="min-w-0">
        <p className="text-[15px] text-[#cfe3cf]">Aaj ka doodh</p><p className="font-display text-[64px] font-extrabold leading-[0.95] tracking-[-0.03em] tnum lg:text-[84px]">{litres(todayMilk).replace(/ L$/, "")}<span className="ml-2 text-[24px] font-bold tracking-normal text-[#cfe3cf]">litre</span></p>
        <p className="mt-2 text-[15px] text-[#cfe3cf]">Kal se {litres(Math.abs(remainingMilk(todayMilk, yMilk)))} {todayMilk < yMilk ? "kam" : "zyada"}</p>
        <dl className="mt-5 flex gap-6"><div><dt className="text-[14px] text-[#cfe3cf]">Subah</dt><dd className="font-display text-[24px] font-bold tnum">{litres(morning)}</dd></div><div><dt className="text-[14px] text-[#cfe3cf]">Shaam</dt><dd className="font-display text-[24px] font-bold tnum">{litres(evening)}</dd></div></dl>
      </div><MilkCan morning={morning} evening={evening} /></div></section>
      <Panel title="Aaj ka hisaab"><dl className="divide-y divide-line"><div className="flex justify-between py-2.5"><dt>Kamai</dt><dd className="font-bold tnum">{money(sale)}</dd></div><div className="flex justify-between py-2.5"><dt>Farm kharcha</dt><dd className="font-bold tnum">{money(expense)}</dd></div><div className="flex justify-between py-2.5"><dt>Munafa</dt><dd className="font-bold tnum">{money(sale - expense)}</dd></div></dl><div className="mt-3 grid grid-cols-2 gap-2"><Link href="/doodh/" className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-berseem font-semibold text-white"><PlusIcon width={18} />Doodh</Link><Link href="/kharcha/" className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-berseem font-semibold text-berseem"><PlusIcon width={18} />Kharcha</Link></div></Panel>
      <div className="lg:col-span-2"><ProfitChart daily={daily} monthly={monthly} dailyLabel={`${shortDate(firstDay)} se ${shortDate(d.today)}`} monthlyLabel={`${d.today.slice(0, 4)}, January se ab tak`} year={{ label: `${d.today.slice(0, 4)}, January se ab tak`, sales: yearSales, expenses: yearExpenses }} /></div>
      <div className="grid gap-4"><Panel title={`Janwar (${active.length})`} aside={<Link href="/janwar/" className="text-sm font-semibold text-berseem underline">Sab dekhein</Link>}><dl className="grid grid-cols-2 gap-3">{[["Doodh de rahe", active.filter((a) => a.milking_status === "milking").length],["Gaabhan", d.animalStatus.filter((s) => active.some((a) => a.id === s.id) && s.breeding_status === "pregnant").length],["Khushk", active.filter((a) => a.milking_status === "dry").length],["Bachay", active.filter((a) => a.category === "calf").length]].map(([label,value]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="font-display text-2xl font-bold tnum">{value}</dd></div>)}</dl></Panel>
        <section id="alerts" className="rounded-2xl border border-line bg-paper p-4"><h2 className="font-display text-[17px] font-bold">Tawajju dein</h2>{d.alerts.length ? <ul className="mt-2 divide-y divide-line">{d.alerts.map((a, i) => <li key={`${a.animal_id}-${a.alert_kind}-${i}`}><Link href={`/janwar/?id=${a.animal_id}`} className="block py-2 text-sm hover:text-berseem">{a.message}</Link></li>)}</ul> : <p className="mt-2 text-sm text-muted">Abhi koi alert nahi.</p>}</section></div>
      <p className="text-sm text-muted lg:col-span-3">Aaj {litres(delivered)} customers ko diya gaya.</p>
    </Body>
  </>;
}

"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Body, PageHeader, Panel } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { rs, litres } from "@/lib/format";
import { historicalPage, HISTORICAL_PAGE_SIZE, type HistoricalKind, type HistoricalRecord } from "@/lib/historical-records";

const types: { value: HistoricalKind; label: string }[] = [
  { value: "all", label: "Sab" }, { value: "milk_day", label: "Roz ka doodh" },
  { value: "expense_day", label: "Roz ka kharcha" }, { value: "customer_month", label: "Maheene ka hisaab" },
  { value: "breeding", label: "Nasl" }, { value: "animal_event", label: "Janwar" },
];
const flagText: Record<string, string> = {
  label_repeated_in_sheet: "Naam sheet mein do baar hai",
  remaining_uses_reverse_sign: "Baqaya ka nishan ulta likha gaya",
  payment_without_litres: "Wusooli hai, doodh nahi likha",
  amount_without_detail: "Raqam ki tafseel nahi likhi",
  possible_summary_row: "Yeh jama shuda total bhi ho sakta hai",
  date_outside_workbook_month: "Tareekh workbook ke maheene se bahar hai",
  status_without_service_date: "Nasl ki asal tareekh nahi likhi",
  service_without_animal_tag: "Janwar ka tag nahi likha",
  summary_total: "Sheet ka kul jama",
  month_only: "Sirf maheene ka record; rozana tafseel nahi mili",
  monthly_hisab_controls: "Maheene ka hisaab tasdeeq hua; rozana sheet alag hai",
  daily_monthly_difference: "Rozana aur maheene ke litre alag hain",
};
const detailText: Record<string, string> = {
  previous_balance_rs: "Pichla baqaya", total_rs: "Kul raqam",
  service_date: "Nasl ki tareekh", semen: "Semen", check_date: "Checkup ki tareekh",
  dry_date: "Khushk ki tareekh", estimated_calving_date: "Mutawaqqa paidaish",
  calving_date: "Paidaish ki tareekh", source_status: "Sheet mein likhi halat",
  event: "Waqia", calf_as_written: "Bacha", tag_as_written: "Tag",
  review_note: "Tafseel",
};

function Amounts({ row }: { row: HistoricalRecord }) {
  const fields: { key: keyof HistoricalRecord; label: string; unit: "litres" | "money" }[] = [
    { key: "litres", label: "Doodh", unit: "litres" },
    { key: "charged_rs", label: "Doodh ki raqam", unit: "money" },
    { key: "paid_rs", label: "Likhi hui wusooli", unit: "money" },
    { key: "remaining_rs", label: "Sheet ka baqaya", unit: "money" },
    { key: "farm_debit_rs", label: "Farm kharcha", unit: "money" },
    { key: "home_debit_rs", label: "Ghar kharcha", unit: "money" },
    { key: "daily_credit_rs", label: "Roz ki aamdani", unit: "money" },
  ];
  const shown = fields.filter(({ key }) => row[key] !== null);
  if (!shown.length) return null;
  return <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
    {shown.map(({ key, label, unit }) => <div key={key}><dt className="text-muted">{label}</dt><dd className="font-semibold tabular-nums">{unit === "litres" ? litres(Number(row[key])) : rs(Number(row[key]))}</dd></div>)}
  </dl>;
}

function Details({ row }: { row: HistoricalRecord }) {
  const data = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
  const items = Object.entries(data).filter(([key, value]) => detailText[key] && value !== null && value !== "");
  if (!items.length) return null;
  return <dl className="mt-2 grid gap-1 text-sm text-muted">
    {items.map(([key, value]) => <div key={key}><dt className="inline font-semibold">{detailText[key]}: </dt><dd className="inline">{key.endsWith("_rs") ? rs(Number(value)) : String(value)}</dd></div>)}
  </dl>;
}

function HistoricalRecordsContent() {
  const customerId = useSearchParams().get("customer") ?? "";
  const [kind, setKind] = useState<HistoricalKind>("all");
  const [month, setMonth] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: ["historical-records", kind, month, search, page, customerId], queryFn: () => historicalPage(kind, month, page, search, customerId) });
  const find = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(0); };
  return <>
    <PageHeader title="Purana record" sub={customerId ? "Is customer ki purani sheets; aaj ke Khata aur Galla mein shamil nahi" : "Purani sheets ka record; aaj ke Khata aur Galla mein shamil nahi"} back={customerId ? `/khata/?id=${customerId}` : "/settings/"} />
    <Body className="grid gap-4 pb-8">
      <Panel><div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Qism<select value={kind} onChange={(event) => { setKind(event.target.value as HistoricalKind); setPage(0); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3">
          {types.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Maheena (khali = sab)<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(0); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3" /></label>
      </div><form onSubmit={find} className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">Naam ya tag dhoondein<input type="search" maxLength={80} value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3" /></label><button type="submit" className="min-h-11 rounded-xl bg-berseem px-4 font-semibold text-white">Dhoondein</button></form></Panel>
      {query.isPending && <p role="status" className="text-muted">Purana record khul raha hai…</p>}
      {query.isError && <p role="alert" className="text-udhaar">Record nahi khula: {friendlyError(query.error)} <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">Dobara koshish</button></p>}
      {query.data && <>
        <p className="text-sm text-muted">{query.data.count.toLocaleString("en-PK")} purani entries. Tareekh ya raqam par sawal ho to asli worksheet ki jagah neeche likhi hai.</p>
        {!query.data.rows.length && <Panel><p>Is filter ka purana record nahi mila.</p></Panel>}
        <ol className="grid gap-3">{query.data.rows.map((row) => <li key={row.source_key} className="min-w-0 rounded-2xl border border-line bg-paper p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><span className="text-xs font-semibold text-berseem-deep">{types.find((type) => type.value === row.kind)?.label}</span><h2 className="break-words font-display text-lg font-bold">{row.source_label || "Naam nahi likha"}</h2>{row.canonical_label && row.canonical_label !== row.source_label && <p className="text-sm text-muted">Ab ka naam: {row.canonical_label}</p>}</div><time className="text-sm text-muted">{row.record_date ? formatDay(row.record_date) : "Tareekh nahi likhi"}</time></div>
          <Amounts row={row} /><Details row={row} />
          {!!row.flags.length && <p className="mt-2 rounded-xl bg-haldi-soft p-2 text-sm">Sheet ki nishandahi: {row.flags.map((flag) => flagText[flag] ?? flag).join("; ")}</p>}
          <p className="mt-3 break-all border-t border-line pt-2 text-xs text-muted">Asal jagah: {row.source_workbook} · {row.source_sheet}!{row.source_cell}</p>
        </li>)}</ol>
        {query.data.count > HISTORICAL_PAGE_SIZE && <nav aria-label="Purane record ke safhay" className="flex items-center justify-between gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Pichhla</button>
          <span className="text-sm">Safha {page + 1} / {Math.ceil(query.data.count / HISTORICAL_PAGE_SIZE)}</span>
          <button type="button" disabled={(page + 1) * HISTORICAL_PAGE_SIZE >= query.data.count} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50">Agla</button>
        </nav>}
      </>}
    </Body>
  </>;
}

export default function HistoricalRecordsPage() {
  return <Suspense><HistoricalRecordsContent /></Suspense>;
}

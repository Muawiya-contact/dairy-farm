"use client";

import { animalFinancialSummary } from "@/lib/animal-finance";
import { money, type Animal, type AnimalFeedRecord, type AnimalIncomeEntry, type AnimalMilk, type HealthEvent } from "@/lib/farm-data";
import { longDate } from "@/lib/farm-data";
import { Panel } from "./ui";

export function AnimalFinancialSummary({ animal, health, income, milk, feed, currentMilkRate }: {
  animal: Animal;
  health: HealthEvent[];
  income: AnimalIncomeEntry[];
  milk: AnimalMilk[];
  feed: AnimalFeedRecord[];
  currentMilkRate: number;
}) {
  const summary = animalFinancialSummary({ animal, health, income, milk, feed, currentMilkRate });
  const hasRecordedRows = summary.lines.some((line) => line.included_in_recorded_total);
  const card = "rounded-xl bg-ground p-3";
  return <Panel title="Janwar ka recorded maali khulasa" className="lg:col-span-2">
    <p className="text-sm text-muted">Yeh sirf is janwar se juri maloomat hai. Actual income mein linked ledger transactions aik martaba ginay jate hain. Milk estimate actual cash nahi, aur estimate net recorded result mein shamil nahi.</p>
    <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className={card}><dt className="text-sm text-muted">Maloom recorded costs</dt><dd className="mt-1 text-lg font-bold">{money(summary.recorded_cost_rs)}</dd><dd className="text-xs text-muted">Purchase profile value aur linked medical expenses</dd></div>
      <div className={card}><dt className="text-sm text-muted">Actual linked income</dt><dd className="mt-1 text-lg font-bold">{summary.lines.some((line) => line.treatment === "recorded revenue") ? money(summary.recorded_revenue_rs) : "Koi linked transaction nahi"}</dd><dd className="text-xs text-muted">Animal sale aur doosri juri hui income</dd></div>
      <div className={card}><dt className="text-sm text-muted">Net recorded result</dt><dd className="mt-1 text-lg font-bold">{hasRecordedRows ? money(summary.net_recorded_rs) : "Financial history nahi"}</dd><dd className="text-xs text-muted">Estimated milk value shamil nahi</dd></div>
      <div className={card}><dt className="text-sm text-muted">Milk value estimate</dt><dd className="mt-1 text-lg font-bold">{summary.milk_value_estimate_rs == null ? "Dastiyab nahi" : money(summary.milk_value_estimate_rs)}</dd><dd className="text-xs text-muted">{summary.milk_litres == null ? "Per-animal milk record nahi" : `${summary.milk_litres.toFixed(2)} L × current rate ${money(summary.milk_rate_rs_per_litre ?? 0)}/L`}</dd></div>
    </dl>
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
      <li>Feed ka kharcha valuation ke baghair nahi jora gaya. Inventory usage sirf stock quantity record karta hai.</li>
      <li>Milk estimate sirf per-animal recorded litres par current configured default rate lagata hai. Farm-total-only shifts aur historical rate changes is estimate mein shamil nahi.</li>
      {summary.health_events_without_cost > 0 && <li>{summary.health_events_without_cost} health record(s) ka positive cost darj nahi; totals mein cost nahi maana.</li>}
      {summary.health_costs_without_linked_expense > 0 && <li>{summary.health_costs_without_linked_expense} health cost record(s) kisi expense transaction se linked nahi; duplicate se bachne ke liye total se bahar hain.</li>}
      {summary.feed_entries_without_valuation > 0 && <li>{summary.feed_entries_without_valuation} current feed entry/entries hain, magar reliable stock cost valuation dastiyab nahi.</li>}
    </ul>
    {summary.lines.length ? <div className="mt-4 overflow-x-auto"><table className="w-full border-collapse text-sm">
      <caption className="sr-only">Animal financial transaction breakdown</caption>
      <thead><tr>{["Tareekh", "Qism", "Tafseel", "Raqam", "Hisaab mein"].map((label) => <th key={label} scope="col" className="border-b border-line px-2 py-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{summary.lines.map((line) => <tr key={line.id}>
        <td className="border-b border-line px-2 py-2 whitespace-nowrap">{line.date ? longDate(line.date) : "—"}</td>
        <td className="border-b border-line px-2 py-2">{line.kind}</td>
        <td className="border-b border-line px-2 py-2">{line.detail}</td>
        <td className="border-b border-line px-2 py-2 whitespace-nowrap">{line.amount_rs == null ? "Dastiyab nahi" : money(line.amount_rs)}</td>
        <td className="border-b border-line px-2 py-2">{line.treatment}{line.treatment === "estimate only" || !line.included_in_recorded_total ? " · recorded net se bahar" : ""}</td>
      </tr>)}</tbody>
    </table></div> : <p className="mt-4 rounded-xl bg-ground p-3 text-sm text-muted">Abhi purchase, linked medical cost, actual income ya per-animal milk record nahi. Missing data ko zero nahi maana gaya.</p>}
  </Panel>;
}

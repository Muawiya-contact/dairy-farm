import type { Animal, AnimalFeedRecord, AnimalIncomeEntry, AnimalMilk, HealthEvent } from "./farm-data";
import { activeAnimalFeedRecords } from "./animal-feeding";

export type AnimalFinanceLine = {
  id: string;
  date: string;
  kind: string;
  detail: string;
  amount_rs: number | null;
  treatment: "recorded cost" | "recorded revenue" | "estimate only" | "excluded / unavailable";
  included_in_recorded_total: boolean;
};

export type AnimalFinancialSummary = {
  lines: AnimalFinanceLine[];
  recorded_cost_rs: number;
  recorded_revenue_rs: number;
  net_recorded_rs: number;
  health_events_without_cost: number;
  health_costs_without_linked_expense: number;
  feed_entries_without_valuation: number;
  milk_litres: number | null;
  milk_rate_rs_per_litre: number | null;
  milk_value_estimate_rs: number | null;
  milk_record_count: number;
};

const cents = (value: number | string | null | undefined) => value == null ? null : Math.round(Number(value) * 100);
const rs = (value: number) => Number((value / 100).toFixed(2));

export function animalFinancialSummary(input: {
  animal: Animal;
  health: HealthEvent[];
  income: AnimalIncomeEntry[];
  milk: AnimalMilk[];
  feed: AnimalFeedRecord[];
  currentMilkRate: number | null | undefined;
}): AnimalFinancialSummary {
  const { animal } = input;
  const lines: AnimalFinanceLine[] = [];
  let costCents = 0;
  let revenueCents = 0;

  const purchaseCents = cents(animal.purchase_price);
  if (purchaseCents != null) {
    costCents += purchaseCents;
    lines.push({ id: `purchase:${animal.id}`, date: animal.purchase_date ?? "", kind: "Purchase price",
      detail: [animal.seller_name, animal.purchase_location, "Animal profile value; not a second farm expense"].filter(Boolean).join(" · "),
      amount_rs: rs(purchaseCents), treatment: "recorded cost", included_in_recorded_total: true });
  }

  let healthEventsWithoutCost = 0;
  let healthCostsWithoutLinkedExpense = 0;
  const includedExpenseIds = new Set<string>();
  for (const event of input.health.filter((row) => row.animal_id === animal.id)) {
    const amount = cents(event.cost);
    if (amount == null || amount <= 0) {
      healthEventsWithoutCost += 1;
      continue;
    }
    if (!event.expense_id) {
      healthCostsWithoutLinkedExpense += 1;
      lines.push({ id: `unlinked-health:${event.id}`, date: event.event_date, kind: "Health cost (unlinked)",
        detail: `${event.title} · reported amount is excluded until linked to the recorded expense`, amount_rs: rs(amount),
        treatment: "excluded / unavailable", included_in_recorded_total: false });
      continue;
    }
    if (includedExpenseIds.has(event.expense_id)) continue;
    includedExpenseIds.add(event.expense_id);
    costCents += amount;
    lines.push({ id: `health:${event.id}`, date: event.event_date, kind: "Medical expense",
      detail: `${event.title} · linked expense recorded once`, amount_rs: rs(amount),
      treatment: "recorded cost", included_in_recorded_total: true });
  }

  for (const income of input.income.filter((row) => row.animal_id === animal.id)) {
    const amount = cents(income.amount);
    if (amount == null || amount <= 0) continue;
    revenueCents += amount;
    const labels: Record<string, string> = { animal_sale: "Animal sale proceeds", manure: "Manure income", other: "Other linked income" };
    lines.push({ id: `income:${income.id}`, date: income.income_date, kind: labels[income.kind] ?? "Linked income",
      detail: [income.note, "Recorded income transaction"].filter(Boolean).join(" · "), amount_rs: rs(amount),
      treatment: "recorded revenue", included_in_recorded_total: true });
  }

  const milkCents = input.milk.filter((row) => row.animal_id === animal.id)
    .reduce((total, row) => total + Math.round(Number(row.litres) * 100), 0);
  const milkLitres = input.milk.some((row) => row.animal_id === animal.id) ? rs(milkCents) : null;
  const milkRateCents = cents(input.currentMilkRate);
  const milkValueCents = milkLitres != null && milkRateCents != null && milkRateCents > 0
    ? Math.round(milkCents * milkRateCents / 100) : null;
  if (milkValueCents != null && milkLitres != null) {
    lines.push({ id: `milk-estimate:${animal.id}`, date: "", kind: "Milk production value estimate",
      detail: `${milkLitres.toFixed(2)} L per-animal recorded production × current configured rate Rs ${rs(milkRateCents!).toFixed(2)}/L; total-only shifts excluded; not cash revenue`,
      amount_rs: rs(milkValueCents), treatment: "estimate only", included_in_recorded_total: false });
  } else if (milkLitres != null) {
    lines.push({ id: `milk-estimate:${animal.id}`, date: "", kind: "Milk value estimate unavailable",
      detail: `${milkLitres.toFixed(2)} L recorded for this animal; no positive current rate or no priced production`,
      amount_rs: null, treatment: "excluded / unavailable", included_in_recorded_total: false });
  }

  const activeFeed = activeAnimalFeedRecords(input.feed.filter((entry) => entry.animal_id === animal.id));
  if (activeFeed.length) {
    lines.push({ id: `feed-cost:${animal.id}`, date: "", kind: "Feed cost unavailable",
      detail: `${activeFeed.length} feed entries have quantity history. Inventory usage has no traceable valuation, so no cost is estimated.`,
      amount_rs: null, treatment: "excluded / unavailable", included_in_recorded_total: false });
  }

  if (healthEventsWithoutCost) {
    lines.push({ id: `unpriced-health:${animal.id}`, date: "", kind: "Medical cost data incomplete",
      detail: `${healthEventsWithoutCost} health event(s) have no positive recorded cost; they are excluded from totals.`,
      amount_rs: null, treatment: "excluded / unavailable", included_in_recorded_total: false });
  }
  if (animal.life_status === "sold" && animal.sale_price != null
      && !input.income.some((entry) => entry.animal_id === animal.id && entry.kind === "animal_sale")) {
    lines.push({ id: `sale-missing:${animal.id}`, date: animal.exit_date ?? "", kind: "Sale ledger transaction unavailable",
      detail: "A sale price is on the animal profile but no linked sale income row was found; not included as recorded revenue.",
      amount_rs: null, treatment: "excluded / unavailable", included_in_recorded_total: false });
  }

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return {
    lines,
    recorded_cost_rs: rs(costCents),
    recorded_revenue_rs: rs(revenueCents),
    net_recorded_rs: rs(revenueCents - costCents),
    health_events_without_cost: healthEventsWithoutCost,
    health_costs_without_linked_expense: healthCostsWithoutLinkedExpense,
    feed_entries_without_valuation: activeFeed.length,
    milk_litres: milkLitres,
    milk_rate_rs_per_litre: milkRateCents == null ? null : rs(milkRateCents),
    milk_value_estimate_rs: milkValueCents == null ? null : rs(milkValueCents),
    milk_record_count: input.milk.filter((row) => row.animal_id === animal.id).length,
  };
}

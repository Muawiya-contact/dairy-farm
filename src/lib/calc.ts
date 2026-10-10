import {
  animals, customers, expenses, farmMilk, monthlyHistory, TODAY,
  COLLECTION_CENTER_RATE, GESTATION_DAYS, HOME_USE_PER_SHIFT,
  type Animal, type AnimalStatus, type Customer, type ExpenseCategory, expenseCategories,
} from "./mock-data";

// ── Formatting ────────────────────────────────────────────────
// Pakistani grouping: 3,20,000
export const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");
export const litres = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} L`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Itwaar", "Peer", "Mangal", "Budh", "Jumeraat", "Jumma", "Hafta"];

const d = (iso: string) => new Date(iso + "T00:00:00");
export const shortDate = (iso: string) => { const x = d(iso); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
export const longDate = (iso: string) => { const x = d(iso); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
export const dayName = (iso: string) => DAYS[d(iso).getDay()];
export const daysBetween = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86400000);
const addDays = (iso: string, n: number) => {
  const x = d(iso); x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// ── Animals ───────────────────────────────────────────────────
export const statusLabel: Record<AnimalStatus, string> = {
  milking: "Doodh de rahi",
  dry: "Khushk",
  pregnant: "Gaabhan",
  sick: "Beemar",
  calf: "Bachha",
};
export const kindLabel = { bhains: "Bhains", gaye: "Gaye" } as const;

export const ageText = (born: string) => {
  const months = Math.floor(daysBetween(born, TODAY) / 30.44);
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m} maah`;
  return m ? `${y} saal ${m} maah` : `${y} saal`;
};

export const avgMilk = (a: Animal) => a.last7.reduce((s, x) => s + x, 0) / a.last7.length;
export const isGivingMilk = (a: Animal) => a.status === "milking" || a.status === "sick" || !!a.alsoMilking;

export const expectedDelivery = (a: Animal) =>
  a.inseminated ? addDays(a.inseminated, GESTATION_DAYS[a.kind]) : undefined;

// Blended rate across all buyers, used for per-animal earning estimate
export const AVG_RATE = 200;
export const monthlyEarning = (a: Animal) => avgMilk(a) * 30 * AVG_RATE;
export const monthlyNet = (a: Animal) => monthlyEarning(a) - a.monthCost;

export const findAnimal = (id: string) => animals.find((a) => a.id === id);
export const childrenOf = (id: string) => animals.filter((a) => a.motherId === id);

export const herdCounts = () => {
  const c = { total: animals.length, milking: 0, dry: 0, pregnant: 0, calf: 0, sick: 0 };
  for (const a of animals) {
    if (a.status === "calf") c.calf++;
    if (a.status === "dry") c.dry++;
    if (a.status === "pregnant") c.pregnant++;
    if (a.status === "sick") c.sick++;
    if (isGivingMilk(a)) c.milking++;
  }
  return c;
};

// ── Milk & customers ──────────────────────────────────────────
export const dayIndex = (iso: string) => d(iso).getDate() - 1; // October data, index 0..9

export const customerLitres = (c: Customer) => c.days.reduce((s, [m, e]) => s + m + e, 0);
export const customerBill = (c: Customer) => customerLitres(c) * c.rate;
export const customerPaid = (c: Customer) => c.payments.reduce((s, p) => s + p.amount, 0);
export const customerBalance = (c: Customer) => c.openingBalance + customerBill(c) - customerPaid(c);
export const findCustomer = (id: string) => customers.find((c) => c.id === id);

export type LedgerRow = { date: string; text: string; litres?: number; debit?: number; credit?: number; balance: number };

export const customerLedger = (c: Customer): LedgerRow[] => {
  const rows: LedgerRow[] = [];
  let bal = c.openingBalance;
  rows.push({ date: "2026-10-01", text: "Pichla", debit: c.openingBalance || undefined, balance: bal });
  c.days.forEach(([m, e], i) => {
    const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
    for (const p of c.payments.filter((p) => p.date === date)) {
      bal -= p.amount;
      rows.push({ date, text: p.mode === "easypaisa" ? "Easypaisa" : p.mode === "bank" ? "Bank" : "Cash", credit: p.amount, balance: bal });
    }
    const l = m + e;
    if (l > 0) {
      bal += l * c.rate;
      rows.push({ date, text: `${m} + ${e} L`, litres: l, debit: l * c.rate, balance: bal });
    }
  });
  return rows;
};

export const shiftSummary = (iso: string, shift: "morning" | "evening") => {
  const i = dayIndex(iso);
  const total = farmMilk[i][shift];
  const toCustomers = customers.reduce((s, c) => s + c.days[i][shift === "morning" ? 0 : 1], 0);
  const sale = customers.reduce((s, c) => s + c.days[i][shift === "morning" ? 0 : 1] * c.rate, 0);
  const center = Math.max(0, total - toCustomers - HOME_USE_PER_SHIFT);
  return { total, toCustomers, center, home: HOME_USE_PER_SHIFT, sale: sale + center * COLLECTION_CENTER_RATE };
};

export const daySales = (iso: string) => shiftSummary(iso, "morning").sale + shiftSummary(iso, "evening").sale;
export const dayExpenses = (iso: string) => expenses.filter((e) => e.date === iso).reduce((s, e) => s + e.amount, 0);

export const octoberSales = () => farmMilk.reduce((s, f) => s + daySales(f.date), 0);
export const octoberExpenses = () => expenses.reduce((s, e) => s + e.amount, 0);

export const yearSeries = () => [
  ...monthlyHistory.map((m) => ({ ...m, profit: m.sales - m.expenses, partial: false })),
  { month: "Oct", sales: octoberSales(), expenses: octoberExpenses(), profit: octoberSales() - octoberExpenses(), partial: true },
];

export const expensesByCategory = () =>
  expenseCategories
    .map(({ key, label }) => ({
      key, label,
      amount: expenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

export const categoryLabel = (k: ExpenseCategory) => expenseCategories.find((c) => c.key === k)?.label ?? k;

// ── Alerts for the dashboard ──────────────────────────────────
export type Alert = { tone: "haldi" | "udhaar" | "neel"; text: string; href: string };

export const alerts = (): Alert[] => {
  const out: Alert[] = [];
  for (const a of animals) {
    const due = expectedDelivery(a);
    if (due) {
      const left = daysBetween(TODAY, due);
      if (left >= 0 && left <= 30) out.push({ tone: "haldi", text: `${a.id} ki delivery ${left} din mein mutawaqqa hai`, href: `/janwar/${a.id}/` });
    }
    if (a.status === "sick") out.push({ tone: "udhaar", text: `${a.id} beemar hai, doodh ${litres(a.last7[0])} se ${litres(a.last7[6])} reh gaya`, href: `/janwar/${a.id}/` });
  }
  const bigDebts = customers.filter((c) => customerBalance(c) > 40000);
  for (const c of bigDebts) out.push({ tone: "udhaar", text: `${c.name} ka udhaar ${rs(customerBalance(c))} ho gaya`, href: `/khata/${c.id}/` });
  out.push({ tone: "neel", text: "Gayon ki lumpy skin vaccine agle maah due hai", href: "/janwar/" });
  return out;
};

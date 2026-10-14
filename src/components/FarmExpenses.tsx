"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { amount, insertRow, longDate, money, shortDate, useFarmData, type Account, type Expense, type ExpenseCategory } from "@/lib/farm-data";
import { friendlyError } from "@/lib/errors";
import { expenseMode, isHomeCategory, parseExpenseEntry, type ExpenseMode } from "@/lib/expense-forms";
import { recordExpense } from "@/lib/expenses";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const modeNames: Record<ExpenseMode, string> = {
  farm: "Farm ka kharcha", home: "Ghar ka kharcha", personal: "Doosra zaati kharcha",
};
type Pending = { id: string; signature: string };

function ExpenseList({ entries, categories, accounts, empty }: {
  entries: Expense[]; categories: ExpenseCategory[]; accounts: Account[]; empty: string;
}) {
  return <ul className="divide-y divide-line text-sm">{entries.map((entry) => {
    const category = categories.find((item) => item.id === entry.category_id);
    const account = accounts.find((item) => item.id === entry.account_id);
    return <li key={entry.id} className="grid gap-1 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_9rem_7rem] sm:items-center">
      <span className="text-muted">{shortDate(entry.expense_date)}</span>
      <span className="min-w-0 break-words">{entry.note || category?.name || "Kharcha"}</span>
      <span className="text-muted">{account?.name || "Account"}</span>
      <strong className="sm:text-right">{money(entry.amount)}</strong>
    </li>;
  })}{!entries.length && <li className="py-3 text-muted">{empty}</li>}</ul>;
}

export default function FarmExpenses() {
  const query = useFarmData();
  const qc = useQueryClient();
  const [mode, setMode] = useState<ExpenseMode>("farm");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef<Pending | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!query.data) return <FarmLoading error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const month = d.today.slice(0, 7);
  const pnl = d.monthlyPnl.find((item) => item.month.startsWith(month))?.data;
  const expenses = d.expenses.filter((entry) => entry.expense_date.startsWith(month))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.id.localeCompare(a.id));
  const categoryById = new Map(d.categories.map((item) => [item.id, item]));
  const farmExpenses = expenses.filter((entry) => expenseMode(categoryById.get(entry.category_id)) === "farm");
  const homeExpenses = expenses.filter((entry) => expenseMode(categoryById.get(entry.category_id)) === "home");
  const personalExpenses = expenses.filter((entry) => expenseMode(categoryById.get(entry.category_id)) === "personal");
  const homeTotal = homeExpenses.reduce((sum, entry) => sum + amount(entry.amount), 0);
  const personalTotal = personalExpenses.reduce((sum, entry) => sum + amount(entry.amount), 0);
  const byCat = d.categories.map((category) => ({ ...category,
    total: expenses.filter((entry) => entry.category_id === category.id).reduce((sum, entry) => sum + amount(entry.amount), 0),
  })).filter((category) => category.total > 0).sort((a, b) => b.total - a.total);
  const maxCategory = byCat[0]?.total || 1;
  const homeCategory = d.categories.find((category) => category.active && isHomeCategory(category));
  const categoryOrder = (a: ExpenseCategory, b: ExpenseCategory) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const farmCategories = d.categories.filter((category) => category.active && category.is_farm_cost).sort(categoryOrder);
  const personalCategories = d.categories.filter((category) => category.active && expenseMode(category) === "personal").sort(categoryOrder);
  const activeAccounts = d.accounts.filter((account) => account.active);
  const availableCategories = mode === "farm" ? farmCategories : personalCategories;
  const defaultCategoryId = mode === "farm"
    ? farmCategories.find((category) => category.name === "Farm ka kharcha")?.id ?? farmCategories[0]?.id ?? ""
    : personalCategories[0]?.id ?? "";
  const canSave = activeAccounts.length > 0 && (mode === "home" ? !!homeCategory : availableCategories.length > 0);

  const run = async (action: () => Promise<void>, message: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      setSuccess(message);
      await Promise.all([qc.invalidateQueries({ queryKey: ["farm-data"] }), qc.invalidateQueries({ queryKey: ["galla"] })]);
    } catch (issue) { setError(friendlyError(issue)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const onExpense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const input = parseExpenseEntry(new FormData(form), mode, d.today, d.accounts, d.categories);
      const signature = JSON.stringify(input);
      if (pending.current?.signature !== signature) pending.current = { id: crypto.randomUUID(), signature };
      await recordExpense(pending.current.id, input);
      pending.current = null;
      form.reset();
    }, `${modeNames[mode]} Supabase mein save ho gaya. Account ka balance update ho gaya.`);
  };

  return <>
    <PageHeader title="Kharcha aur munafa" sub={`${longDate(`${month}-01`)} se ${longDate(d.today)}`} />
    <Body className="grid gap-4 lg:grid-cols-2">
      <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-paper lg:col-span-2 lg:grid-cols-4">
        <div className="border-b border-line p-3 sm:p-4 lg:border-b-0 lg:border-r"><p className="text-sm text-muted">Kamai</p><strong className="font-display text-xl">{money(pnl?.total_income)}</strong></div>
        <div className="border-b border-l border-line p-3 sm:p-4 lg:border-b-0"><p className="text-sm text-muted">Farm kharcha</p><strong className="font-display text-xl">{money(pnl?.farm_expenses)}</strong></div>
        <div className="p-3 sm:p-4 lg:border-x lg:border-line"><p className="text-sm text-muted">Ghar ka kharcha</p><strong className="font-display text-xl">{money(homeTotal)}</strong></div>
        <div className="border-l border-line p-3 sm:p-4 lg:border-l-0"><p className="text-sm text-muted">Farm munafa</p><strong className={`font-display text-xl ${amount(pnl?.profit) < 0 ? "text-udhaar" : "text-berseem"}`}>{money(pnl?.profit)}</strong></div>
      </section>
      {personalTotal > 0 && <p className="text-sm text-muted lg:col-span-2">Doosray zaati kharchay: {money(personalTotal)}. Ghar aur doosray zaati kharchay account se nikalte hain, farm munafay se nahi.</p>}
      <Panel title="Naya kharcha" className="lg:col-span-2">
        <div className="mb-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="Kharcha ki qism">
          {(["farm", "home", "personal"] as const).map((choice) => <button key={choice} type="button" disabled={busy} onClick={() => { setMode(choice); setError(""); setSuccess(""); }}
            aria-pressed={mode === choice} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${mode === choice ? "border-berseem bg-berseem-soft text-berseem-deep" : "border-line"}`}>
            {modeNames[choice]}
          </button>)}
        </div>
        <form key={mode} onSubmit={onExpense} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Tareekh<input name="date" type="date" max={d.today} required defaultValue={d.today} className={field} /></label>
          {mode === "home" ? <div className="self-end rounded-xl bg-berseem-soft px-3 py-3 text-sm text-berseem-deep">Category: Ghar ka kharcha</div>
            : <label className="text-sm">Category<select name="category" required defaultValue={defaultCategoryId} className={field}>
              <option value="" disabled>Category chunein</option>{availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>}
          <label className="text-sm">Paisa kis account se nikla?<select name="account" required defaultValue={activeAccounts[0]?.id ?? ""} className={field}>
            <option value="" disabled>Account chunein</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select></label>
          <label className="text-sm">Raqam (Rs)<input name="amount" required type="number" min="0.01" step="0.01" placeholder="Misal: 1250" className={field} /></label>
          <label className="text-sm sm:col-span-2">Tafseel (optional)<input name="note" placeholder="Misal: ghar ka rashan" className={field} /></label>
          <button disabled={busy || !canSave} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">{modeNames[mode]} save karein</button>
        </form>
        {!canSave && <p className="mt-2 text-sm text-udhaar" role="alert">Pehle active account aur is qism ki category chahiye. Migration apply hui hai ya nahi, check karein.</p>}
        <p className="mt-2 text-xs text-muted">Ghar ka kharcha chunein to raqam account se niklegi; farm munafa nahi badlega. Save ke baad entry Galla mein bhi dikhegi.</p>
      </Panel>
      <Panel title="Kahan kharcha hua" className="lg:col-span-2"><ul className="grid gap-3">{byCat.map((category) => <li key={category.id} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-2 text-sm">
        <span className="truncate">{category.name}</span><span className="h-3 overflow-hidden rounded-full bg-ground"><span className="block h-full rounded-full bg-haldi" style={{ width: `${category.total / maxCategory * 100}%` }} /></span><strong>{money(category.total)}</strong>
      </li>)}{!byCat.length && <li className="text-muted">Is maah koi kharcha nahi.</li>}</ul></Panel>
      <Panel title="Farm ke kharchay" className="lg:col-span-2"><ExpenseList entries={farmExpenses} categories={d.categories} accounts={d.accounts} empty="Is maah farm ka kharcha nahi." /></Panel>
      <Panel title="Ghar ke kharchay" className="lg:col-span-2"><ExpenseList entries={homeExpenses} categories={d.categories} accounts={d.accounts} empty="Is maah ghar ka kharcha nahi." /></Panel>
      {!!personalExpenses.length && <Panel title="Doosray zaati kharchay" className="lg:col-span-2"><ExpenseList entries={personalExpenses} categories={d.categories} accounts={d.accounts} empty="Is maah koi entry nahi." /></Panel>}
      <Panel title="Category aur account setup" className="lg:col-span-2"><div className="grid gap-5 sm:grid-cols-2">
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; void run(async () => {
          const fields = new FormData(form);
          await insertRow("expense_categories", { name: String(fields.get("name")).trim(), is_farm_cost: fields.get("farm") === "on" });
          form.reset();
        }, "Category Supabase mein save ho gayi."); }} className="grid gap-2"><h3 className="font-semibold">Nayi category</h3>
          <input name="name" required placeholder="Category ka naam" aria-label="Category ka naam" className={field} />
          <label className="text-sm"><input name="farm" type="checkbox" defaultChecked /> Farm kharcha</label>
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-semibold text-berseem">Category save</button>
        </form>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; void run(async () => {
          const fields = new FormData(form);
          await insertRow("accounts", { name: String(fields.get("name")).trim(), kind: String(fields.get("kind")), is_farm_cash: !d.accounts.some((account) => account.is_farm_cash) });
          form.reset();
        }, "Account Supabase mein save ho gaya."); }} className="grid gap-2"><h3 className="font-semibold">Naya account</h3>
          <input name="name" required placeholder="Account ka naam" aria-label="Account ka naam" className={field} />
          <select name="kind" aria-label="Account qism" className={field}><option value="cash">Cash</option>{d.accounts.some((account) => account.is_farm_cash) && <><option value="bank">Bank</option><option value="person">Person</option></>}</select>
          <button disabled={busy} className="min-h-11 rounded-xl border border-berseem font-semibold text-berseem">Account save</button>
        </form>
      </div></Panel>
      {success && <p role="status" className="text-berseem-deep lg:col-span-2">{success}</p>}
      {error && <p role="alert" className="text-udhaar lg:col-span-2">Save nahi hua: {error} Agar connection toot gaya ho to dobara save se pehle list check karein.</p>}
    </Body>
  </>;
}

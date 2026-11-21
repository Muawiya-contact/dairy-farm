"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { amount, farmToday, money, shortDate } from "@/lib/farm-data";
import {
  createInventoryCategory, createInventoryItem, getInventoryHistory, getInventoryStock,
  getInventoryItems, INVENTORY_UNITS, INVENTORY_UNIT_LABEL, loadInventorySetup,
  recordInventoryAdjustment, recordInventoryPurchase, recordInventoryUsage,
  updateInventoryCategory, updateInventoryItem,
  type InventoryCategory, type InventoryItem, type InventoryStock, type InventoryUnit,
} from "@/lib/farm-inventory";
import { friendlyError } from "@/lib/errors";
import { Body, PageHeader, Panel } from "./ui";
import { FarmLoading } from "./FarmDashboard";

const field = "min-h-11 w-full rounded-xl border border-line bg-paper px-3";
const unitLabel = (unit: string) => INVENTORY_UNIT_LABEL[unit as InventoryUnit] ?? unit;
const defaultCategoryLabels: Record<string, string> = {
  "Animal feed & fodder": "Janwaron ka chara",
  "Medicines & veterinary": "Dawai aur tibbi saman",
  "Farm equipment & supplies": "Farm ke auzaar aur zarooriyat",
  "Other consumables": "Doosra rozmarra ka saman",
};
const categoryLabel = (name: string) => defaultCategoryLabels[name] ?? name;
const quantity = (value: number | string | null | undefined) => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
const stockTone = (item: InventoryStock) => item.out_of_stock ? "text-udhaar" : item.low_stock ? "text-haldi-ink" : "text-berseem-deep";
const monthStart = (today: string) => `${today.slice(0, 7)}-01`;

type Operation = "item" | "purchase" | "usage" | "adjustment" | "categories" | null;
type PendingRequest = { id: string; signature: string };

function StockStatus({ item }: { item: InventoryStock }) {
  if (item.out_of_stock) return <span className="rounded-full bg-udhaar-soft px-2.5 py-1 text-xs font-semibold text-udhaar">Stock khatam</span>;
  if (item.low_stock) return <span className="rounded-full bg-haldi-soft px-2.5 py-1 text-xs font-semibold text-haldi-ink">Stock kam</span>;
  return <span className="rounded-full bg-berseem-soft px-2.5 py-1 text-xs font-semibold text-berseem-deep">Stock mojood</span>;
}

function InventoryActions({ operation, setOperation, busy }: { operation: Operation; setOperation: (value: Operation) => void; busy: boolean }) {
  const actions: { key: Operation; label: string }[] = [
    { key: "item", label: "Samaan add karein" }, { key: "purchase", label: "Stock andar karein" },
    { key: "usage", label: "Stock jari karein" }, { key: "adjustment", label: "Stock durust karein" },
    { key: "categories", label: "Qismein" },
  ];
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Stock ke kaam">
    {actions.map((action) => <button key={action.key} type="button" disabled={busy} aria-pressed={operation === action.key}
      onClick={() => setOperation(operation === action.key ? null : action.key)}
      className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${operation === action.key ? "border-berseem bg-berseem-soft text-berseem-deep" : "border-line text-ink"}`}>
      {action.label}
    </button>)}
  </div>;
}

export default function FarmInventory() {
  const today = farmToday();
  const qc = useQueryClient();
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [operation, setOperation] = useState<Operation>(null);
  const [adjustmentType, setAdjustmentType] = useState<"adjustment" | "wastage">("adjustment");
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef(new Map<string, PendingRequest>());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const stock = useQuery({ queryKey: ["inventory", "stock", asOf], queryFn: () => getInventoryStock(asOf) });
  const currentStock = useQuery({ queryKey: ["inventory", "stock", today], queryFn: () => getInventoryStock(today) });
  const items = useQuery({ queryKey: ["inventory", "items"], queryFn: getInventoryItems });
  const setup = useQuery({ queryKey: ["inventory", "setup"], queryFn: loadInventorySetup });
  const history = useQuery({
    queryKey: ["inventory", "history", selectedItemId, from, to],
    queryFn: () => getInventoryHistory(selectedItemId, from, to),
    enabled: !!selectedItemId && !!from && !!to && from <= to && to <= today,
  });

  const stockRows = useMemo(() => stock.data ?? [], [stock.data]);
  const categories = setup.data?.categories ?? [];
  const activeCategories = categories.filter((item) => item.active);
  const editCategories = editingItem && !activeCategories.some((item) => item.id === editingItem.category_id)
    ? [...activeCategories, ...categories.filter((item) => item.id === editingItem.category_id)]
    : activeCategories;
  const activeItems = (items.data ?? []).filter((item) => item.active);
  const accounts = setup.data?.accounts ?? [];
  const activeAccounts = accounts.filter((item) => item.active);
  const farmExpenseCategories = (setup.data?.expenseCategories ?? []).filter((item) => item.active && item.is_farm_cost && !item.is_salary);
  const staff = setup.data?.staff ?? [];
  const selectedCurrentStock = currentStock.data?.find((item) => item.item_id === selectedItemId);
  const filteredStock = useMemo(() => stockRows.filter((item) =>
    (categoryFilter === "all" || item.category_id === categoryFilter) &&
    (!search.trim() || item.item_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))),
  [stockRows, categoryFilter, search]);
  const lowCount = stockRows.filter((item) => item.low_stock).length;
  const outCount = stockRows.filter((item) => item.out_of_stock).length;

  if (stock.isLoading || currentStock.isLoading || items.isLoading || setup.isLoading) {
    return <FarmLoading error={stock.error ?? currentStock.error ?? items.error ?? setup.error} retry={() => { void stock.refetch(); void currentStock.refetch(); void items.refetch(); void setup.refetch(); }} />;
  }
  if (stock.error || currentStock.error || items.error || setup.error || !setup.data) {
    return <FarmLoading error={stock.error ?? currentStock.error ?? items.error ?? setup.error ?? new Error("Stock ka record dastiyab nahi.")} retry={() => { void stock.refetch(); void currentStock.refetch(); void items.refetch(); void setup.refetch(); }} />;
  }

  const invalidate = async () => Promise.all([
    qc.invalidateQueries({ queryKey: ["inventory"] }, { throwOnError: true }),
    qc.invalidateQueries({ queryKey: ["farm-data"] }, { throwOnError: true }),
    qc.invalidateQueries({ queryKey: ["galla"] }, { throwOnError: true }),
  ]);

  const submit = (event: FormEvent<HTMLFormElement>, action: string, input: unknown,
    save: (requestId: string) => Promise<unknown>, message: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (busyRef.current) return;
    const signature = JSON.stringify(input);
    const key = `${action}:${signature}`;
    let request = pending.current.get(key);
    if (!request) {
      request = { id: crypto.randomUUID(), signature };
      pending.current.set(key, request);
    }
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    void (async () => {
      try {
        await save(request!.id);
        pending.current.delete(key);
        try {
          await invalidate();
          setSuccess(message);
        } catch {
          setSuccess("Record mehfooz ho gaya. Naya stock na dikhe to page dobara kholein.");
        }
        form.reset();
        if (action === "item.create") setOperation(null);
        if (action === "adjustment") setAdjustmentType("adjustment");
        if (action === "item.update") setEditingItem(null);
        if (action === "category.create" || action === "category.update") {
          setEditingCategory(null);
          setOperation(null);
        }
      } catch (issue) {
        setError(friendlyError(issue));
      } finally {
        busyRef.current = false; setBusy(false);
      }
    })();
  };

  const onCreateItem = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name") ?? "").trim(), categoryId: String(form.get("category") ?? ""),
      unit: String(form.get("unit") ?? "kg") as InventoryUnit,
      type: String(form.get("type") ?? "consumable") as "consumable" | "durable",
      minimum: Number(form.get("minimum")), opening: Number(form.get("opening") || 0),
      openingUnit: String(form.get("opening_unit") ?? form.get("unit") ?? "kg") as InventoryUnit,
      openingDate: String(form.get("opening_date") || today),
    };
    submit(event, "item.create", input, (requestId) => createInventoryItem({ requestId, ...input }), "Samaan add ho gaya.");
  };

  const onUpdateItem = (event: FormEvent<HTMLFormElement>) => {
    if (!editingItem) return;
    const form = new FormData(event.currentTarget);
    const input: InventoryItem = {
      ...editingItem, name: String(form.get("name") ?? "").trim(), category_id: String(form.get("category") ?? ""),
      base_unit: String(form.get("unit") ?? "kg"), item_type: String(form.get("type") ?? "consumable"),
      minimum_stock: Number(form.get("minimum")), active: form.get("active") === "on",
    };
    submit(event, "item.update", input, () => updateInventoryItem(input), "Samaan update ho gaya.");
  };

  const onPurchase = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const input = {
      itemId: String(form.get("item") ?? ""), quantity: Number(form.get("quantity")),
      unit: String(form.get("unit") ?? "kg") as InventoryUnit, rate: Number(form.get("rate")),
      total: Number(form.get("total")), date: String(form.get("date") || today),
      accountId: String(form.get("account") ?? ""), expenseCategoryId: String(form.get("expense_category") ?? ""),
      supplier: String(form.get("supplier") ?? "").trim(), reference: String(form.get("reference") ?? "").trim(),
      note: String(form.get("note") ?? "").trim(), batch: String(form.get("batch") ?? "").trim(),
      expiry: String(form.get("expiry") ?? ""),
    };
    submit(event, "purchase", input, (requestId) => recordInventoryPurchase({ requestId, ...input }),
      "Khareed stock aur Kharcha mein darj hui; chune hue Galla account se raqam kati.");
  };

  const onUsage = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const input = {
      itemId: String(form.get("item") ?? ""), quantity: Number(form.get("quantity")),
      unit: String(form.get("unit") ?? "kg") as InventoryUnit, date: String(form.get("date") || today),
      staffId: String(form.get("staff") ?? "") || null,
      purpose: String(form.get("purpose") ?? "").trim(), note: String(form.get("note") ?? "").trim(),
    };
    submit(event, "usage", input, (requestId) => recordInventoryUsage({ requestId, ...input }),
      "Stock jari ho gaya. Naya Kharcha ya Galla record nahi bana.");
  };

  const onAdjustment = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "adjustment") as "adjustment" | "wastage";
    const direction = (type === "wastage" ? -1 : Number(form.get("direction"))) as -1 | 1;
    const input = {
      itemId: String(form.get("item") ?? ""), quantity: Number(form.get("quantity")),
      unit: String(form.get("unit") ?? "kg") as InventoryUnit, direction,
      date: String(form.get("date") || today), type,
      reason: String(form.get("reason") ?? "").trim(), note: String(form.get("note") ?? "").trim(),
    };
    submit(event, "adjustment", input, (requestId) => recordInventoryAdjustment({ requestId, ...input }), "Stock ki durustgi wajah aur audit record ke sath mehfooz ho gayi.");
  };

  const onCreateCategory = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim() };
    submit(event, "category.create", input, (requestId) => createInventoryCategory(requestId, input.name, input.description), "Nayi qism add ho gayi.");
  };

  const onUpdateCategory = (event: FormEvent<HTMLFormElement>) => {
    if (!editingCategory) return;
    const form = new FormData(event.currentTarget);
    const input: InventoryCategory = {
      ...editingCategory, name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null, active: form.get("active") === "on",
    };
    submit(event, "category.update", input, () => updateInventoryCategory(input), "Qism update ho gayi.");
  };

  const resetItemSelection = (id: string) => {
    setSelectedItemId(id);
    setFrom(monthStart(today)); setTo(today);
  };
  const availableFor = (id: string) => stockRows.find((row) => row.item_id === id);
  const baseUnitFor = (id: string): InventoryUnit => (items.data ?? []).find((item) => item.id === id)?.base_unit as InventoryUnit
    ?? activeItems[0]?.base_unit as InventoryUnit ?? "kg";
  const updateUnitFromItem = (event: ChangeEvent<HTMLSelectElement>) => {
    const unit = event.currentTarget.form?.elements.namedItem("unit");
    if (unit instanceof HTMLSelectElement) unit.value = baseUnitFor(event.currentTarget.value);
  };

  return <>
    <PageHeader title="Farm ka Stock" sub="Stock, khareed, istemal aur saman ka tareekh-war record." />
    <Body className="grid gap-4">
      {error && <p role="alert" className="rounded-xl bg-udhaar-soft px-4 py-3 text-sm font-semibold text-udhaar">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-berseem-soft px-4 py-3 text-sm font-semibold text-berseem-deep">{success}</p>}

      <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="border-r border-line p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Mojood saman</p><strong className="font-display text-xl">{activeItems.length}</strong></div>
        <div className="border-r border-line p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Stock kam</p><strong className="font-display text-xl text-haldi-ink">{lowCount}</strong></div>
        <div className="p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Stock khatam</p><strong className="font-display text-xl text-udhaar">{outCount}</strong></div>
      </section>

      <Panel title="Tareekh ke mutabiq stock">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr]">
          <label className="text-sm">Is tareekh tak<input type="date" value={asOf} max={today} onChange={(event) => setAsOf(event.target.value)} className={field} /></label>
          <label className="text-sm">Qism<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={field}>
            <option value="all">Tamam qismein</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{categoryLabel(item.name)}</option>)}
          </select></label>
          <label className="text-sm">Samaan dhoondein<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Wanda, dawa, zaroori saman…" className={field} /></label>
        </div>
        {stock.isFetching && <p role="status" className="mt-2 text-xs text-muted">Stock update ho raha hai…</p>}
        <ul className="mt-3 divide-y divide-line">
          {filteredStock.map((item) => <li key={item.item_id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <button type="button" onClick={() => resetItemSelection(item.item_id)} aria-pressed={selectedItemId === item.item_id}
              className="min-h-11 min-w-0 rounded-lg text-left sm:px-2">
              <strong className="block truncate">{item.item_name}</strong><span className="block text-xs text-muted">{categoryLabel(item.category_name)} · {item.item_type === "durable" ? "Dairpa saman" : "Istemaali saman"}</span>
            </button>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`font-semibold ${stockTone(item)}`}>{quantity(item.current_stock)} {unitLabel(item.base_unit)}</span><StockStatus item={item} /></div>
            <button type="button" aria-label={`${item.item_name} badlein`} onClick={() => { setEditingItem((items.data ?? []).find((entry) => entry.id === item.item_id) ?? null); setOperation("item"); }}
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">Badlein</button>
          </li>)}
          {!filteredStock.length && <li className="py-4 text-sm text-muted">In filters mein koi saman nahi mila.</li>}
        </ul>
      </Panel>

      <Panel title="Stock ke kaam"><InventoryActions operation={operation} setOperation={(value) => { setOperation(value); if (value !== "item") setEditingItem(null); if (value !== "categories") setEditingCategory(null); }} busy={busy} />
        {operation === "item" && <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-3 font-semibold">{editingItem ? "Samaan badlein" : "Naya saman add karein"}</h3>
          {editingItem ? <form key={`edit-${editingItem.id}`} onSubmit={onUpdateItem} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Samaan ka naam<input name="name" required maxLength={120} defaultValue={editingItem.name} className={field} /></label>
            <label className="text-sm">Qism<select name="category" required defaultValue={editingItem.category_id} className={field}><option value="" disabled>Qism chunein</option>{editCategories.map((item) => <option key={item.id} value={item.id}>{categoryLabel(item.name)}{item.active ? "" : " (band hai)"}</option>)}</select></label>
            <label className="text-sm">Stock ki unit<select name="unit" defaultValue={editingItem.base_unit} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
            <label className="text-sm">Saman ki qism<select name="type" defaultValue={editingItem.item_type} className={field}><option value="consumable">Istemaali saman</option><option value="durable">Dairpa auzaar</option></select></label>
            <label className="text-sm">Kam stock ki had (stock ki unit)<input name="minimum" type="number" min="0" step="0.000001" required defaultValue={editingItem.minimum_stock} className={field} /></label>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-line px-3 text-sm"><input name="active" type="checkbox" defaultChecked={editingItem.active} className="h-5 w-5" />Samaan chalu hai</label>
            <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Samaan mehfooz karein</button>
            <button type="button" disabled={busy} onClick={() => setEditingItem(null)} className="min-h-11 rounded-xl border border-line font-semibold">Radd karein</button>
            <p className="text-xs text-muted sm:col-span-2">Stock ki entry darj hone ke baad stock ki unit nahi badal sakte. Baqi stock ho to saman band nahi kar sakte.</p>
          </form> : <form onSubmit={onCreateItem} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Samaan ka naam<input name="name" required maxLength={120} placeholder="Misal: Wanda" className={field} /></label>
            <label className="text-sm">Qism<select name="category" required defaultValue="" className={field}><option value="" disabled>Qism chunein</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{categoryLabel(item.name)}</option>)}</select></label>
            <label className="text-sm">Stock ki unit<select name="unit" defaultValue="kg" className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
            <label className="text-sm">Saman ki qism<select name="type" defaultValue="consumable" className={field}><option value="consumable">Istemaali saman</option><option value="durable">Dairpa auzaar</option></select></label>
            <label className="text-sm">Kam stock ki had (stock ki unit)<input name="minimum" type="number" min="0" step="0.000001" required defaultValue="0" className={field} /></label>
            <label className="text-sm">Shuru ka stock (stock ki unit mein)<input name="opening" type="number" min="0" step="0.000001" defaultValue="0" className={field} /></label>
            <label className="text-sm">Shuru ki tareekh<input name="opening_date" type="date" max={today} defaultValue={today} className={field} /></label>
            <p className="self-end text-xs text-muted">Shuru ka stock hisaab ke record ke sath darj hoga. Stock na ho to miktar 0 rehne dein.</p>
            <button disabled={busy || !activeCategories.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Samaan add karein</button>
          </form>}
        </div>}

        {operation === "purchase" && <form onSubmit={onPurchase} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Khareed / stock andar</h3>
          <label className="text-sm">Samaan<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Samaan chunein</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel(item.base_unit)}</option>)}</select></label>
          <label className="text-sm">Khareed ki tareekh<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Miktar<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Miqdar ki unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm">Chuni hui unit ka rate (Rs)<input name="rate" type="number" min="0.0001" step="0.0001" required className={field} /></label>
          <label className="text-sm">Ada ki gayi kul raqam (Rs)<input name="total" type="number" min="0.01" step="0.01" required className={field} /></label>
          <label className="text-sm">Farm Galla se ada karein<select name="account" required defaultValue="" className={field}><option value="" disabled>Galla khata chunein</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Kharcha ki qism<select name="expense_category" required defaultValue="" className={field}><option value="" disabled>Farm kharcha ki qism chunein</option>{farmExpenseCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Dukandaar (ikhtiyari)<input name="supplier" maxLength={160} className={field} /></label>
          <label className="text-sm">Bill / hawala (ikhtiyari)<input name="reference" maxLength={160} className={field} /></label>
          <label className="text-sm">Batch ka code (ikhtiyari)<input name="batch" maxLength={100} className={field} /></label>
          <label className="text-sm">Miyaad ki tareekh (ikhtiyari)<input name="expiry" type="date" className={field} /></label>
          <label className="text-sm sm:col-span-2">Mazeed tafseel (ikhtiyari)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">Kul raqam = miktar × unit rate. Is se stock ki aik entry aur Kharcha darj hoga, aur chune hue Galla account se aik hi transaction mein raqam kategi.</p>
          <button disabled={busy || !activeItems.length || !activeAccounts.length || !farmExpenseCategories.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Khareed mehfooz karein</button>
        </form>}

        {operation === "usage" && <form onSubmit={onUsage} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Stock jari / istemal darj karein</h3>
          <label className="text-sm">Samaan<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Samaan chunein</option>{activeItems.map((item) => { const row = availableFor(item.id); return <option key={item.id} value={item.id}>{item.name} — {quantity(row?.current_stock)} {unitLabel(item.base_unit)} dastiyab</option>; })}</select></label>
          <label className="text-sm">Stock jari karne ki tareekh<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Miktar<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Miqdar ki unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm">Kis ko diya (ikhtiyari)<select name="staff" defaultValue="" className={field}><option value="">Farm ka aam istemal</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Maqsad<input name="purpose" required minLength={2} maxLength={300} placeholder="Janwar ka chara, ilaaj, marammat…" className={field} /></label>
          <label className="text-sm sm:col-span-2">Mazeed tafseel (ikhtiyari)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">Stock jari karne se sirf stock kam hota hai. Naya Kharcha darj nahi hota aur Galla se raqam nahi kat-ti.</p>
          <button disabled={busy || !activeItems.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Stock jari karein</button>
        </form>}

        {operation === "adjustment" && <form onSubmit={onAdjustment} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Stock ki durustgi / zaya</h3>
          <label className="text-sm">Samaan<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Samaan chunein</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel(item.base_unit)}</option>)}</select></label>
          <label className="text-sm">Tareekh<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Durustgi ki qism<select name="type" value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as "adjustment" | "wastage")} className={field}><option value="adjustment">Ginti ki durustgi</option><option value="wastage">Kharabi / miyaad / zaya</option></select></label>
          {adjustmentType === "adjustment" ? <label className="text-sm">Tabdeeli<select name="direction" defaultValue="-1" className={field}><option value="1">Stock barhayein</option><option value="-1">Stock kam karein</option></select></label> : <input type="hidden" name="direction" value="-1" />}
          <label className="text-sm">Miktar<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Miqdar ki unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm sm:col-span-2">Wajah (lazmi)<input name="reason" required minLength={3} maxLength={500} placeholder="Ginti ke farq ya nuqsan ki wajah batayein" className={field} /></label>
          <label className="text-sm sm:col-span-2">Mazeed tafseel (ikhtiyari)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">Zaya hone se stock kam hota hai. Har durustgi tareekh, darj karne wale aur hisaab ke record ke sath mehfooz hoti hai.</p>
          <button disabled={busy || !activeItems.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Durustgi mehfooz karein</button>
        </form>}

        {operation === "categories" && <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
          <form onSubmit={onCreateCategory} className="grid content-start gap-3">
            <h3 className="font-semibold">Nayi qism add karein</h3>
            <label className="text-sm">Naam<input name="name" required maxLength={100} className={field} /></label>
            <label className="text-sm">Tafseel (ikhtiyari)<input name="description" maxLength={500} className={field} /></label>
            <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Qism add karein</button>
          </form>
          <div><h3 className="mb-2 font-semibold">Qismein sambhalein</h3><ul className="divide-y divide-line">{categories.map((category) => <li key={category.id} className="flex min-h-12 items-center justify-between gap-2 py-2 text-sm">
            <span>{categoryLabel(category.name)} {!category.active && <span className="text-muted">(band)</span>}</span>
            <button type="button" disabled={busy} onClick={() => setEditingCategory(category)} className="min-h-10 rounded-xl border border-line px-3 font-semibold">Badlein</button>
          </li>)}</ul>
            {editingCategory && <form key={editingCategory.id} onSubmit={onUpdateCategory} className="mt-3 grid gap-3 rounded-xl bg-ground p-3">
              <h4 className="font-semibold">Qism badlein</h4>
              <label className="text-sm">Naam<input name="name" required maxLength={100} defaultValue={editingCategory.name} className={field} /></label>
              <label className="text-sm">Tafseel<input name="description" maxLength={500} defaultValue={editingCategory.description ?? ""} className={field} /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editingCategory.active} className="h-5 w-5" />Qism chalu hai</label>
              <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Qism mehfooz karein</button>
            </form>}
          </div>
        </div>}
      </Panel>

      {selectedCurrentStock && <Panel title="Stock ka tareekh-war record">
        <p className="mb-3 text-sm"><strong>{selectedCurrentStock.item_name}</strong> · Abhi dastiyab: {quantity(selectedCurrentStock.current_stock)} {unitLabel(selectedCurrentStock.base_unit)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Shuru<input type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} className={field} /></label>
          <label className="text-sm">Aakhir<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} className={field} /></label>
        </div>
        {from > to && <p role="alert" className="mt-3 text-sm text-udhaar">Shuru ki tareekh aakhri tareekh se baad nahi ho sakti.</p>}
        {history.isLoading && <p role="status" className="mt-3 text-sm text-muted">Stock ka record load ho raha hai…</p>}
        {history.error && <p role="alert" className="mt-3 text-sm text-udhaar">Stock ka record load nahi hua: {friendlyError(history.error)}</p>}
        {history.data?.length ? <ol className="mt-3 divide-y divide-line">{history.data.map((movement) => {
          const increase = amount(movement.quantity_delta) > 0;
          const movementLabel = movement.movement_type === "opening" ? "Shuru ka stock" : movement.movement_type === "purchase" ? "Khareed" : movement.movement_type === "usage" ? "Istemal / jari" : movement.movement_type === "wastage" ? "Zaya" : "Durustgi";
          return <li key={movement.movement_id} className="grid gap-1 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-start">
            <span className="text-sm text-muted">{shortDate(movement.movement_date)}</span>
            <span className="min-w-0 text-sm"><strong className="block">{movementLabel}</strong>
              <span className="block break-words text-muted">{movement.staff_name ? `Jari kiya: ${movement.staff_name}` : movement.purpose || movement.reason || movement.supplier || movement.note || "—"}</span>
              {movement.total_amount !== null && <span className="block text-xs text-muted">{money(movement.total_amount)} {movement.account_name ?? "Galla account"} se ada · Kharcha se jura</span>}
              {movement.reference && <span className="block text-xs text-muted">Hawala: {movement.reference}</span>}
              {movement.batch_code && <span className="block text-xs text-muted">Batch: {movement.batch_code}{movement.expiry_date ? ` · Miyaad ${shortDate(movement.expiry_date)}` : ""}</span>}
              {movement.reason && <span className="block text-xs text-muted">Wajah: {movement.reason}</span>}
            </span>
            <span className="text-right text-sm"><strong className={increase ? "text-berseem-deep" : "text-udhaar"}>{increase ? "+" : "−"}{quantity(movement.entered_quantity)} {unitLabel(movement.entered_unit)}</strong><span className="block text-xs text-muted">Baqi: {quantity(movement.running_balance_after)} {unitLabel(movement.stock_unit)}</span></span>
          </li>;
        })}</ol> : !history.isLoading && !history.error && <p className="mt-3 text-sm text-muted">Is tareekh ki muddat mein koi movement nahi.</p>}
        {history.isFetching && !history.isLoading && <p role="status" className="mt-2 text-xs text-muted">Record update ho raha hai…</p>}
      </Panel>}
      {!stockRows.length && <Panel title="Shuru karein"><p className="text-sm text-muted">Chara, dawa, auzaar aur farm ke dusre saman ka stock dekhne ke liye pehla saman add karein.</p><button type="button" onClick={() => setOperation("item")} className="mt-3 min-h-11 rounded-xl bg-berseem px-4 font-bold text-white">Pehla saman add karein</button></Panel>}
    </Body>
  </>;
}

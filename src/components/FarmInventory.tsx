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
const quantity = (value: number | string | null | undefined) => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const stockTone = (item: InventoryStock) => item.out_of_stock ? "text-udhaar" : item.low_stock ? "text-haldi-ink" : "text-berseem-deep";
const monthStart = (today: string) => `${today.slice(0, 7)}-01`;

type Operation = "item" | "purchase" | "usage" | "adjustment" | "categories" | null;
type PendingRequest = { id: string; signature: string };

function StockStatus({ item }: { item: InventoryStock }) {
  if (item.out_of_stock) return <span className="rounded-full bg-udhaar-soft px-2.5 py-1 text-xs font-semibold text-udhaar">Out of stock</span>;
  if (item.low_stock) return <span className="rounded-full bg-haldi-soft px-2.5 py-1 text-xs font-semibold text-haldi-ink">Low stock</span>;
  return <span className="rounded-full bg-berseem-soft px-2.5 py-1 text-xs font-semibold text-berseem-deep">In stock</span>;
}

function InventoryActions({ operation, setOperation, busy }: { operation: Operation; setOperation: (value: Operation) => void; busy: boolean }) {
  const actions: { key: Operation; label: string }[] = [
    { key: "item", label: "Add item" }, { key: "purchase", label: "Stock in" },
    { key: "usage", label: "Issue stock" }, { key: "adjustment", label: "Adjust stock" },
    { key: "categories", label: "Categories" },
  ];
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Inventory actions">
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
    return <FarmLoading error={stock.error ?? currentStock.error ?? items.error ?? setup.error ?? new Error("Inventory data is unavailable.")} retry={() => { void stock.refetch(); void currentStock.refetch(); void items.refetch(); void setup.refetch(); }} />;
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
          setSuccess("Saved successfully. Refresh the page if the latest balances do not appear yet.");
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
    submit(event, "item.create", input, (requestId) => createInventoryItem({ requestId, ...input }), "Inventory item added.");
  };

  const onUpdateItem = (event: FormEvent<HTMLFormElement>) => {
    if (!editingItem) return;
    const form = new FormData(event.currentTarget);
    const input: InventoryItem = {
      ...editingItem, name: String(form.get("name") ?? "").trim(), category_id: String(form.get("category") ?? ""),
      base_unit: String(form.get("unit") ?? "kg"), item_type: String(form.get("type") ?? "consumable"),
      minimum_stock: Number(form.get("minimum")), active: form.get("active") === "on",
    };
    submit(event, "item.update", input, () => updateInventoryItem(input), "Inventory item updated.");
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
      "Purchase saved to stock, Kharcha, and the selected Galla account.");
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
      "Stock issue saved. No new Kharcha or Galla entry was created.");
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
    submit(event, "adjustment", input, (requestId) => recordInventoryAdjustment({ requestId, ...input }), "Stock adjustment saved with its reason and audit history.");
  };

  const onCreateCategory = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim() };
    submit(event, "category.create", input, (requestId) => createInventoryCategory(requestId, input.name, input.description), "Inventory category added.");
  };

  const onUpdateCategory = (event: FormEvent<HTMLFormElement>) => {
    if (!editingCategory) return;
    const form = new FormData(event.currentTarget);
    const input: InventoryCategory = {
      ...editingCategory, name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || null, active: form.get("active") === "on",
    };
    submit(event, "category.update", input, () => updateInventoryCategory(input), "Inventory category updated.");
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
    <PageHeader title="Farm Inventory" sub="Manage stock, purchases, issues, and item history." />
    <Body className="grid gap-4">
      {error && <p role="alert" className="rounded-xl bg-udhaar-soft px-4 py-3 text-sm font-semibold text-udhaar">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-berseem-soft px-4 py-3 text-sm font-semibold text-berseem-deep">{success}</p>}

      <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="border-r border-line p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Mojood items</p><strong className="font-display text-xl">{activeItems.length}</strong></div>
        <div className="border-r border-line p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Low stock</p><strong className="font-display text-xl text-haldi-ink">{lowCount}</strong></div>
        <div className="p-3 sm:p-4"><p className="text-xs text-muted sm:text-sm">Out of stock</p><strong className="font-display text-xl text-udhaar">{outCount}</strong></div>
      </section>

      <Panel title="Stock on date">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr]">
          <label className="text-sm">As of<input type="date" value={asOf} max={today} onChange={(event) => setAsOf(event.target.value)} className={field} /></label>
          <label className="text-sm">Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={field}>
            <option value="all">All categories</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="text-sm">Search items<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Feed, medicine, supplies…" className={field} /></label>
        </div>
        {stock.isFetching && <p role="status" className="mt-2 text-xs text-muted">Refreshing stock…</p>}
        <ul className="mt-3 divide-y divide-line">
          {filteredStock.map((item) => <li key={item.item_id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <button type="button" onClick={() => resetItemSelection(item.item_id)} aria-pressed={selectedItemId === item.item_id}
              className="min-h-11 min-w-0 rounded-lg text-left sm:px-2">
              <strong className="block truncate">{item.item_name}</strong><span className="block text-xs text-muted">{item.category_name} · {item.item_type === "durable" ? "Durable" : "Consumable"}</span>
            </button>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`font-semibold ${stockTone(item)}`}>{quantity(item.current_stock)} {unitLabel(item.base_unit)}</span><StockStatus item={item} /></div>
            <button type="button" aria-label={`Edit ${item.item_name}`} onClick={() => { setEditingItem((items.data ?? []).find((entry) => entry.id === item.item_id) ?? null); setOperation("item"); }}
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">Edit</button>
          </li>)}
          {!filteredStock.length && <li className="py-4 text-sm text-muted">No inventory items match these filters.</li>}
        </ul>
      </Panel>

      <Panel title="Inventory actions"><InventoryActions operation={operation} setOperation={(value) => { setOperation(value); if (value !== "item") setEditingItem(null); if (value !== "categories") setEditingCategory(null); }} busy={busy} />
        {operation === "item" && <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-3 font-semibold">{editingItem ? "Edit inventory item" : "Add inventory item"}</h3>
          {editingItem ? <form key={`edit-${editingItem.id}`} onSubmit={onUpdateItem} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Item name<input name="name" required maxLength={120} defaultValue={editingItem.name} className={field} /></label>
            <label className="text-sm">Category<select name="category" required defaultValue={editingItem.category_id} className={field}><option value="" disabled>Select category</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm">Stock unit<select name="unit" defaultValue={editingItem.base_unit} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
            <label className="text-sm">Item type<select name="type" defaultValue={editingItem.item_type} className={field}><option value="consumable">Consumable</option><option value="durable">Durable equipment</option></select></label>
            <label className="text-sm">Low-stock minimum (stock unit)<input name="minimum" type="number" min="0" step="0.000001" required defaultValue={editingItem.minimum_stock} className={field} /></label>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-line px-3 text-sm"><input name="active" type="checkbox" defaultChecked={editingItem.active} className="h-5 w-5" />Item is active</label>
            <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Save item</button>
            <button type="button" disabled={busy} onClick={() => setEditingItem(null)} className="min-h-11 rounded-xl border border-line font-semibold">Cancel</button>
            <p className="text-xs text-muted sm:col-span-2">Stock unit cannot change after the item has any movement. An item with remaining stock cannot be deactivated.</p>
          </form> : <form onSubmit={onCreateItem} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Item name<input name="name" required maxLength={120} placeholder="e.g. Wanda" className={field} /></label>
            <label className="text-sm">Category<select name="category" required defaultValue="" className={field}><option value="" disabled>Select category</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm">Stock unit<select name="unit" defaultValue="kg" className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
            <label className="text-sm">Item type<select name="type" defaultValue="consumable" className={field}><option value="consumable">Consumable</option><option value="durable">Durable equipment</option></select></label>
            <label className="text-sm">Low-stock minimum (stock unit)<input name="minimum" type="number" min="0" step="0.000001" required defaultValue="0" className={field} /></label>
            <label className="text-sm">Opening stock (in stock unit)<input name="opening" type="number" min="0" step="0.000001" defaultValue="0" className={field} /></label>
            <label className="text-sm">Shuru ki tareekh<input name="opening_date" type="date" max={today} defaultValue={today} className={field} /></label>
            <p className="self-end text-xs text-muted">Opening stock is saved as an audited movement; leave quantity at 0 if there is no opening stock.</p>
            <button disabled={busy || !activeCategories.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Add item</button>
          </form>}
        </div>}

        {operation === "purchase" && <form onSubmit={onPurchase} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Purchase / stock in</h3>
          <label className="text-sm">Item<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel(item.base_unit)}</option>)}</select></label>
          <label className="text-sm">Purchase date<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Quantity<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm">Rate per selected unit (Rs)<input name="rate" type="number" min="0.0001" step="0.0001" required className={field} /></label>
          <label className="text-sm">Total paid (Rs)<input name="total" type="number" min="0.01" step="0.01" required className={field} /></label>
          <label className="text-sm">Paid from Galla account<select name="account" required defaultValue="" className={field}><option value="" disabled>Select account</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Kharcha category<select name="expense_category" required defaultValue="" className={field}><option value="" disabled>Select farm expense category</option>{farmExpenseCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Supplier (optional)<input name="supplier" maxLength={160} className={field} /></label>
          <label className="text-sm">Invoice / reference (optional)<input name="reference" maxLength={160} className={field} /></label>
          <label className="text-sm">Batch code (optional)<input name="batch" maxLength={100} className={field} /></label>
          <label className="text-sm">Expiry date (optional)<input name="expiry" type="date" className={field} /></label>
          <label className="text-sm sm:col-span-2">Notes (optional)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">The total must equal quantity × unit rate. This saves one stock movement and one Kharcha entry, and debits the chosen Galla account in a single transaction.</p>
          <button disabled={busy || !activeItems.length || !activeAccounts.length || !farmExpenseCategories.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Save purchase</button>
        </form>}

        {operation === "usage" && <form onSubmit={onUsage} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Issue stock / record usage</h3>
          <label className="text-sm">Item<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Select item</option>{activeItems.map((item) => { const row = availableFor(item.id); return <option key={item.id} value={item.id}>{item.name} — {quantity(row?.current_stock)} {unitLabel(item.base_unit)} available</option>; })}</select></label>
          <label className="text-sm">Issue date<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Quantity<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm">Issued to (optional)<select name="staff" defaultValue="" className={field}><option value="">General farm use</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Purpose<input name="purpose" required minLength={2} maxLength={300} placeholder="Animal feed, treatment, repair…" className={field} /></label>
          <label className="text-sm sm:col-span-2">Notes (optional)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">Usage reduces stock only. It does not create another Kharcha entry or Galla debit.</p>
          <button disabled={busy || !activeItems.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Save stock issue</button>
        </form>}

        {operation === "adjustment" && <form onSubmit={onAdjustment} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Stock adjustment / wastage</h3>
          <label className="text-sm">Item<select name="item" required defaultValue={selectedItemId && activeItems.some((item) => item.id === selectedItemId) ? selectedItemId : ""} onChange={updateUnitFromItem} className={field}><option value="" disabled>Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel(item.base_unit)}</option>)}</select></label>
          <label className="text-sm">Date<input name="date" type="date" required max={today} defaultValue={today} className={field} /></label>
          <label className="text-sm">Adjustment type<select name="type" value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as "adjustment" | "wastage")} className={field}><option value="adjustment">Physical count correction</option><option value="wastage">Damage / expiry / wastage</option></select></label>
          {adjustmentType === "adjustment" ? <label className="text-sm">Direction<select name="direction" defaultValue="-1" className={field}><option value="1">Increase stock</option><option value="-1">Decrease stock</option></select></label> : <input type="hidden" name="direction" value="-1" />}
          <label className="text-sm">Quantity<input name="quantity" type="number" min="0.000001" step="0.000001" required className={field} /></label>
          <label className="text-sm">Unit<select name="unit" defaultValue={baseUnitFor(selectedItemId)} className={field}>{INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label>
          <label className="text-sm sm:col-span-2">Reason (required)<input name="reason" required minLength={3} maxLength={500} placeholder="Explain the count difference or loss" className={field} /></label>
          <label className="text-sm sm:col-span-2">Notes (optional)<input name="note" maxLength={1000} className={field} /></label>
          <p className="text-xs text-muted sm:col-span-2">Wastage always reduces stock. All adjustments are dated, attributed to the recording user, and preserved in the movement history.</p>
          <button disabled={busy || !activeItems.length} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50 sm:col-span-2">Save adjustment</button>
        </form>}

        {operation === "categories" && <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
          <form onSubmit={onCreateCategory} className="grid content-start gap-3">
            <h3 className="font-semibold">Add category</h3>
            <label className="text-sm">Name<input name="name" required maxLength={100} className={field} /></label>
            <label className="text-sm">Description (optional)<input name="description" maxLength={500} className={field} /></label>
            <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Add category</button>
          </form>
          <div><h3 className="mb-2 font-semibold">Manage categories</h3><ul className="divide-y divide-line">{categories.map((category) => <li key={category.id} className="flex min-h-12 items-center justify-between gap-2 py-2 text-sm">
            <span>{category.name} {!category.active && <span className="text-muted">(inactive)</span>}</span>
            <button type="button" disabled={busy} onClick={() => setEditingCategory(category)} className="min-h-10 rounded-xl border border-line px-3 font-semibold">Edit</button>
          </li>)}</ul>
            {editingCategory && <form key={editingCategory.id} onSubmit={onUpdateCategory} className="mt-3 grid gap-3 rounded-xl bg-ground p-3">
              <h4 className="font-semibold">Edit category</h4>
              <label className="text-sm">Name<input name="name" required maxLength={100} defaultValue={editingCategory.name} className={field} /></label>
              <label className="text-sm">Description<input name="description" maxLength={500} defaultValue={editingCategory.description ?? ""} className={field} /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editingCategory.active} className="h-5 w-5" />Category is active</label>
              <button disabled={busy} className="min-h-11 rounded-xl bg-berseem font-bold text-white disabled:opacity-50">Save category</button>
            </form>}
          </div>
        </div>}
      </Panel>

      {selectedCurrentStock && <Panel title="Item movement history">
        <p className="mb-3 text-sm"><strong>{selectedCurrentStock.item_name}</strong> · Current available: {quantity(selectedCurrentStock.current_stock)} {unitLabel(selectedCurrentStock.base_unit)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">From<input type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} className={field} /></label>
          <label className="text-sm">Through<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} className={field} /></label>
        </div>
        {from > to && <p role="alert" className="mt-3 text-sm text-udhaar">Start date must be on or before the end date.</p>}
        {history.isLoading && <p role="status" className="mt-3 text-sm text-muted">Loading item movements…</p>}
        {history.error && <p role="alert" className="mt-3 text-sm text-udhaar">Movement history could not be loaded: {friendlyError(history.error)}</p>}
        {history.data?.length ? <ol className="mt-3 divide-y divide-line">{history.data.map((movement) => {
          const increase = amount(movement.quantity_delta) > 0;
          const movementLabel = movement.movement_type === "opening" ? "Opening stock" : movement.movement_type === "purchase" ? "Purchase" : movement.movement_type === "usage" ? "Usage / issue" : movement.movement_type === "wastage" ? "Wastage" : "Adjustment";
          return <li key={movement.movement_id} className="grid gap-1 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-start">
            <span className="text-sm text-muted">{shortDate(movement.movement_date)}</span>
            <span className="min-w-0 text-sm"><strong className="block">{movementLabel}</strong>
              <span className="block break-words text-muted">{movement.staff_name ? `Issued to ${movement.staff_name}` : movement.purpose || movement.reason || movement.supplier || movement.note || "—"}</span>
              {movement.total_amount !== null && <span className="block text-xs text-muted">{money(movement.total_amount)} paid from {movement.account_name ?? "Galla account"} · linked to Kharcha</span>}
              {movement.reference && <span className="block text-xs text-muted">Reference: {movement.reference}</span>}
              {movement.batch_code && <span className="block text-xs text-muted">Batch: {movement.batch_code}{movement.expiry_date ? ` · Expires ${shortDate(movement.expiry_date)}` : ""}</span>}
              {movement.reason && <span className="block text-xs text-muted">Reason: {movement.reason}</span>}
            </span>
            <span className="text-right text-sm"><strong className={increase ? "text-berseem-deep" : "text-udhaar"}>{increase ? "+" : "−"}{quantity(movement.entered_quantity)} {unitLabel(movement.entered_unit)}</strong><span className="block text-xs text-muted">Balance: {quantity(movement.running_balance_after)} {unitLabel(movement.stock_unit)}</span></span>
          </li>;
        })}</ol> : !history.isLoading && !history.error && <p className="mt-3 text-sm text-muted">No movements in this date range.</p>}
        {history.isFetching && !history.isLoading && <p role="status" className="mt-2 text-xs text-muted">Updating history…</p>}
      </Panel>}
      {!stockRows.length && <Panel title="Getting started"><p className="text-sm text-muted">Add your first item to start tracking feed, medicines, equipment, and other farm supplies.</p><button type="button" onClick={() => setOperation("item")} className="mt-3 min-h-11 rounded-xl bg-berseem px-4 font-bold text-white">Add first item</button></Panel>}
    </Body>
  </>;
}

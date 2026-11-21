import type { KhataPeriodCustomer } from "./reporting";

export type KhataCustomerSortKey = "name" | "litres" | "charges" | "payments" | "closing_balance";
export type SortDirection = "asc" | "desc";

export function filterAndSortKhataCustomers(
  rows: KhataPeriodCustomer[],
  search: string,
  sortKey: KhataCustomerSortKey,
  direction: SortDirection,
): KhataPeriodCustomer[] {
  const query = search.trim().toLocaleLowerCase();
  return rows
    .filter((row) => !query || row.name.toLocaleLowerCase().includes(query))
    .slice()
    .sort((left, right) => {
      const comparison = sortKey === "name"
        ? left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
        : left[sortKey] - right[sortKey];
      return (direction === "asc" ? comparison : -comparison)
        || left.sort_order - right.sort_order
        || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
}

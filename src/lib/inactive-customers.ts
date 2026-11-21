export type InactiveCustomer = {
  customer_id: string;
  name: string;
  phone: string | null;
  kind: string;
  active: boolean;
  sort_order: number;
};

type CustomerPurchaseSummary = { customer_id: string; litres: number; charges: number };

/** Active paying customers without recorded milk sales or company bills in the selected period. */
export function selectInactiveCustomers(
  customers: InactiveCustomer[],
  periodSales: CustomerPurchaseSummary[],
): InactiveCustomer[] {
  const purchaserIds = new Set(periodSales
    .filter((row) => row.litres > 0 || row.charges > 0)
    .map((row) => row.customer_id));

  return customers.filter((customer) => customer.active && customer.kind !== "free" && !purchaserIds.has(customer.customer_id))
    .slice().sort((left, right) => left.sort_order - right.sort_order
      || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      || left.customer_id.localeCompare(right.customer_id));
}

export type InactiveCustomer = {
  customer_id: string;
  name: string;
  phone: string | null;
  kind: string;
  active: boolean;
  sort_order: number;
};

type CustomerPurchaseSummary = { customer_id: string; litres: number; charges: number };

function phoneSearchForms(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const forms = [digits];
  if (digits.startsWith("92") && digits.length === 12) forms.push(`0${digits.slice(2)}`);
  if (digits.startsWith("0") && digits.length === 11) forms.push(`92${digits.slice(1)}`);
  return forms;
}

export function inactiveCustomerMatchesSearch(customer: InactiveCustomer, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (customer.name.toLocaleLowerCase().includes(needle) || customer.kind.toLocaleLowerCase().includes(needle)) return true;

  const phoneDigits = search.replace(/\D/g, "");
  if (phoneDigits.length < 4 || !customer.phone) return false;
  const searchForms = phoneSearchForms(search);
  const customerForms = phoneSearchForms(customer.phone);
  return searchForms.some((searchForm) => customerForms.some((customerForm) => customerForm.includes(searchForm)));
}

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

import { describe, expect, it } from "vitest";
import type { KhataPeriodCustomer } from "@/lib/reporting";
import { filterAndSortKhataCustomers } from "@/lib/khata-summary";

const customer = (overrides: Partial<KhataPeriodCustomer>): KhataPeriodCustomer => ({
  customer_id: "customer-1", name: "Ali", kind: "regular", active: true, sort_order: 0,
  litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0, balance_adjustments: 0,
  opening_balance: 0, opening_added: 0, closing_balance: 0,
  ...overrides,
});

describe("filterAndSortKhataCustomers", () => {
  const rows = [
    customer({ customer_id: "a", name: "Ali Traders", sort_order: 2, charges: 100, closing_balance: 40 }),
    customer({ customer_id: "b", name: "Babar Farm", sort_order: 1, charges: 300, closing_balance: 10 }),
    customer({ customer_id: "c", name: "ALI Store", sort_order: 3, charges: 200, closing_balance: 20 }),
  ];

  it("filters names without changing the source rows", () => {
    expect(filterAndSortKhataCustomers(rows, "  ali ", "name", "asc").map((row) => row.customer_id)).toEqual(["c", "a"]);
    expect(rows.map((row) => row.customer_id)).toEqual(["a", "b", "c"]);
  });

  it("sorts numeric values in either direction with stable tie ordering", () => {
    expect(filterAndSortKhataCustomers(rows, "", "charges", "desc").map((row) => row.customer_id)).toEqual(["b", "c", "a"]);
    expect(filterAndSortKhataCustomers(rows, "", "closing_balance", "asc").map((row) => row.customer_id)).toEqual(["b", "c", "a"]);
  });
});

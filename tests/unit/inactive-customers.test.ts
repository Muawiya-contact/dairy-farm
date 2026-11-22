import { expect, it } from "vitest";
import { inactiveCustomerKindLabel, inactiveCustomerMatchesSearch, selectInactiveCustomers, type InactiveCustomer } from "@/lib/inactive-customers";

const customers: InactiveCustomer[] = [
  { customer_id: "recent", name: "Recent Buyer", phone: null, kind: "regular", active: true, sort_order: 3 },
  { customer_id: "inactive", name: "No Recent Sale", phone: "03000000000", kind: "regular", active: true, sort_order: 2 },
  { customer_id: "company", name: "Company Bill", phone: null, kind: "company", active: true, sort_order: 1 },
  { customer_id: "closed", name: "Closed Account", phone: null, kind: "regular", active: false, sort_order: 4 },
  { customer_id: "free", name: "Free Recipient", phone: null, kind: "free", active: true, sort_order: 5 },
  { customer_id: "zero-charge", name: "Zero Charge Delivery", phone: null, kind: "regular", active: true, sort_order: 6 },
];

it("lists active paying customers without period sales, excluding buyers, closed accounts, and free recipients", () => {
  const result = selectInactiveCustomers(customers, [
    { customer_id: "recent", litres: 12, charges: 0 },
    { customer_id: "company", litres: 0, charges: 4200 },
    { customer_id: "zero-charge", litres: 3, charges: 0 },
  ]);

  expect(result.map((customer) => customer.customer_id)).toEqual(["inactive"]);
});

it("returns all eligible customers in stable display order when the period has no sales", () => {
  const result = selectInactiveCustomers(customers, []);
  expect(result.map((customer) => customer.customer_id)).toEqual(["company", "inactive", "recent", "zero-charge"]);
});

it("matches customer phones across local and international Pakistan formats", () => {
  const customer = { ...customers[1], phone: "+923001234567" };

  expect(inactiveCustomerMatchesSearch(customer, "0300 123 4567")).toBe(true);
  expect(inactiveCustomerMatchesSearch(customer, "+92 (300) 123-4567")).toBe(true);
  expect(inactiveCustomerMatchesSearch(customer, "3001234")).toBe(true);
  expect(inactiveCustomerMatchesSearch(customer, "03101234567")).toBe(false);
  expect(inactiveCustomerMatchesSearch(customer, "No Recent")).toBe(true);
  expect(inactiveCustomerMatchesSearch(customer, "Aam")).toBe(true);
});

it("shows readable customer-kind labels instead of stored enum values", () => {
  expect(inactiveCustomerKindLabel("regular")).toBe("Aam");
  expect(inactiveCustomerKindLabel("contractor")).toBe("Thekedaar");
  expect(inactiveCustomerKindLabel("company")).toBe("Company");
  expect(inactiveCustomerKindLabel("cash")).toBe("Naqd");
  expect(inactiveCustomerKindLabel("free")).toBe("Muft");
  expect(inactiveCustomerKindLabel("future_kind")).toBe("Doosri qism");
});

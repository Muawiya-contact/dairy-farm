import { expect, it } from "vitest";
import {
  parseCompanyBill, parseCustomerPayment, parseCustomerProfile, parseCustomerRate, parseNewCustomer,
} from "../../src/lib/customer-forms";

const today = "2026-10-14";
const form = (fields: Record<string, string>) => {
  const value = new FormData();
  for (const [key, entry] of Object.entries(fields)) value.set(key, entry);
  return value;
};

it("accepts a customer advance but rejects negative rates and milk quantities", () => {
  const base = { name: "  Ahmed  ", phone: "03001234567", openingDate: today,
    rate: "180", morning: "2.50", evening: "1", openingBalance: "-1250.50" };
  expect(parseNewCustomer(form(base), "regular", today)).toMatchObject({
    name: "Ahmed", phone: "+923001234567", openingBalance: -1250.5, rate: 180,
  });
  expect(() => parseNewCustomer(form({ ...base, morning: "-1" }), "regular", today)).toThrow(/Subah doodh/);
  expect(() => parseNewCustomer(form({ ...base, rate: "-180" }), "regular", today)).toThrow(/Doodh ka rate/);
  expect(() => parseNewCustomer(form({ ...base, openingBalance: "12.345" }), "regular", today)).toThrow(/Pichla baqaya/);
  expect(parseNewCustomer(form(base), "cash", today).openingBalance).toBe(0);
});

it("validates edits, payments and effective rates before writing", () => {
  expect(parseCustomerProfile(form({ name: "Ahmed", phone: "", morning: "", evening: "0", active: "on" }))).toEqual({
    name: "Ahmed", phone: "", morning: 0, evening: 0, active: true,
  });
  expect(() => parseCustomerProfile(form({ name: "Ahmed", morning: "-0.01" }))).toThrow(/Subah doodh/);
  const payment = { date: today, amount: "500", method: "cash", account: "farm-account" };
  expect(parseCustomerPayment(form(payment), today).amount).toBe(500);
  expect(() => parseCustomerPayment(form({ ...payment, amount: "-5" }), today)).toThrow(/Wusooli/);
  expect(() => parseCustomerPayment(form({ ...payment, amount: "0" }), today)).toThrow(/Wusooli/);
  expect(() => parseCustomerPayment(form({ ...payment, date: "2026-10-15" }), today)).toThrow(/aaj se aage/);
  expect(parseCustomerRate(form({ date: today, rate: "190" }), today, "2026-10-01")).toEqual({ date: today, rate: 190 });
  expect(() => parseCustomerRate(form({ date: "2026-09-30", rate: "190" }), today, "2026-10-01")).toThrow(/pehle/);
});

it("checks company bill dates and signed input independently", () => {
  const base = { from: "2026-10-01", to: today, litres: "150.50", amount: "27000" };
  expect(parseCompanyBill(form(base), today)).toEqual({ from: "2026-10-01", to: today, litres: 150.5, amount: 27000 });
  expect(() => parseCompanyBill(form({ ...base, litres: "-1" }), today)).toThrow(/Slip litres/);
  expect(() => parseCompanyBill(form({ ...base, amount: "-1" }), today)).toThrow(/Company bill/);
  expect(() => parseCompanyBill(form({ ...base, from: "2026-10-15" }), today)).toThrow(/aaj se aage/);
  expect(() => parseCompanyBill(form({ ...base, to: "2026-09-30" }), today)).toThrow(/shuru se pehle/);
});

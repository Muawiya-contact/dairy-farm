import { describe, expect, it } from "vitest";
import { parseAgreedAmount, parsePayment, parsePeriod, parseStaff, remainingCents } from "../src/lib/salary-forms";

const today = "2026-10-14";
const staff = [{ id: "worker", name: "Test Worker", monthly_salary: 1000, active: true }];
const period = { id: "october", staff_id: "worker", salary_month: "2026-10-01", agreed_amount: 1000 };
const accounts = [{ id: "cash", active: true, opening_date: "2026-09-01" }, { id: "closed", active: false, opening_date: "2026-09-01" }];
const payments = [{ salary_period_id: "october", amount: 400 }];

function form(fields: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}

describe("staff salary forms", () => {
  it("accepts a staff record and snapshots an agreed month", () => {
    expect(parseStaff(form({ name: "  Ismail  ", role: " Worker ", monthly_salary: "25000.50", active: "on" })))
      .toEqual({ name: "Ismail", role: "Worker", monthly_salary: 25000.5, active: true });
    expect(parsePeriod(form({ staff: "worker", month: "2026-10", agreed_amount: "1000" }), today, staff))
      .toEqual({ staff_id: "worker", salary_month: "2026-10-01", agreed_amount: 1000 });
    expect(() => parsePeriod(form({ staff: "worker", month: "2026-11", agreed_amount: "1000" }), today, staff)).toThrow(/Aane wale/);
    expect(() => parsePeriod(form({ staff: "missing", month: "2026-10", agreed_amount: "1000" }), today, staff)).toThrow(/Mulazim/);
  });

  it("treats a blank default as unset and rejects invalid salary values", () => {
    expect(parseStaff(form({ name: "Variable pay", monthly_salary: "" })).monthly_salary).toBe(0);
    for (const amount of ["-1", "1.001", "10000000000"]) {
      expect(() => parseStaff(form({ name: "Test", monthly_salary: amount }))).toThrow();
    }
    expect(() => parseStaff(form({ name: "", monthly_salary: "0" }))).toThrow(/naam/);
    expect(() => parsePeriod(form({ staff: "worker", month: "2026-10", agreed_amount: "0" }), today, staff)).toThrow();
    expect(() => parsePeriod(form({ staff: "worker", month: "2026-10", agreed_amount: "-5" }), today, staff)).toThrow();
  });

  it("calculates a partial balance in cents and rejects overpayment or advances", () => {
    expect(remainingCents(period, payments)).toBe(60000);
    expect(parsePayment(form({ date: today, account: "cash", amount: "600.00", note: "  second half  " }), today, period, accounts, payments))
      .toEqual({ date: today, periodId: "october", staffId: "worker", accountId: "cash", amount: 600, note: "second half" });
    for (const amount of ["", "0", "-1", "1.001", "600.01"]) {
      expect(() => parsePayment(form({ date: today, account: "cash", amount }), today, period, accounts, payments)).toThrow();
    }
    expect(() => parsePayment(form({ date: "2026-09-30", account: "cash", amount: "1" }), today, period, accounts, payments)).toThrow(/maheena/);
    expect(() => parsePayment(form({ date: "2026-10-15", account: "cash", amount: "1" }), today, period, accounts, payments)).toThrow(/aage/);
    expect(() => parsePayment(form({ date: today, account: "closed", amount: "1" }), today, period, accounts, payments)).toThrow(/Active account/);
    expect(() => parsePayment(form({ date: today, account: "", amount: "1" }), today, period, accounts, payments)).toThrow(/Active account/);
    expect(parseAgreedAmount("1000", period, payments)).toBe(1000);
    expect(() => parseAgreedAmount("399.99", period, payments)).toThrow(/ada shuda/);
    expect(() => parseAgreedAmount("1100", period, payments)).toThrow(/Adaigi ke baad/);
  });
});

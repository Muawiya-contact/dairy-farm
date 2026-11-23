import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let customerId: string;
const adjustmentId = "12345678-1234-4234-8234-123456789001";
const ownerId = "12345678-1234-4234-8234-123456789099";

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  await db.exec("insert into auth.users(id) values ('" + ownerId + "'); insert into private.app_owner(user_id) values ('" + ownerId + "');");
  const customer = await db.query<{ id: string }>(
    "insert into customers(name, kind, opening_date, opening_balance) values ('Purana Khata buyer', 'regular', '2026-10-01', 100) returning id",
  );
  customerId = customer.rows[0].id;
  await db.exec("set request.jwt.claim.sub = '" + ownerId + "'; set role authenticated;");
}, 30_000);

afterAll(async () => { await db?.close(); });

test("dated old due and advance flow through balances and reports without becoming cash or income", async () => {
  await db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-10',500,'Pehle ka baqaya')",
    [adjustmentId, customerId],
  );
  await db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-11',-50,'Pehle diya advance')",
    ["12345678-1234-4234-8234-123456789002", customerId],
  );
  await db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-10',500,'Pehle ka baqaya')",
    [adjustmentId, customerId],
  );
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-10',501,'Pehle ka baqaya')",
    [adjustmentId, customerId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_ID_REUSED");

  const balance = (await db.query<{ balance: string }>(
    "select balance from customer_balances where customer_id = $1", [customerId],
  )).rows[0];
  expect(balance.balance).toBe("550.00");
  const month = (await db.query<Record<string, string>>(
    "select previous_balance, amount, balance_adjustment, total, balance from customer_month_report('2026-10-01') where customer_id = $1",
    [customerId],
  )).rows[0];
  expect(month).toMatchObject({ previous_balance: "100.00", amount: "0", balance_adjustment: "450.00", total: "550.00", balance: "550.00" });

  const period = (await db.query<Record<string, string>>(
    "select balance_adjustment, period_balance_change from report_period_customers('2026-10-10','2026-10-11') where customer_id = $1",
    [customerId],
  )).rows[0];
  expect(period).toEqual({ balance_adjustment: "450.00", period_balance_change: "450.00" });
  const ledger = (await db.query<Record<string, string>>(
    "select entry_kind, balance_adjustment, running_balance from customer_period_ledger($1,'2026-10-10','2026-10-11') order by entry_date",
    [customerId],
  )).rows;
  expect(ledger).toEqual([
    { entry_kind: "balance_adjustment", balance_adjustment: "500.00", running_balance: "600.00" },
    { entry_kind: "balance_adjustment", balance_adjustment: "-50.00", running_balance: "550.00" },
  ]);
  const ledgerSummary = (await db.query<Record<string, string>>(
    "select opening_balance, balance_adjustments, closing_balance from customer_period_ledger_summary($1,'2026-10-10','2026-10-11')",
    [customerId],
  )).rows[0];
  expect(ledgerSummary).toEqual({ opening_balance: "100.00", balance_adjustments: "450.00", closing_balance: "550.00" });
  const summary = (await db.query<Record<string, string>>(
    "select balance_adjustments, opening_balance, closing_balance from khata_period_summary('2026-10-10','2026-10-11') where customer_id = $1",
    [customerId],
  )).rows[0];
  expect(summary).toEqual({ balance_adjustments: "450.00", opening_balance: "100.00", closing_balance: "550.00" });
  const final = (await db.query<Record<string, string>>(
    "select balance_adjustments, total_payable, closing_balance from final_report_khata('2026-10-10','2026-10-11') where customer_id = $1",
    [customerId],
  )).rows[0];
  expect(final).toEqual({ balance_adjustments: "450.00", total_payable: "550.00", closing_balance: "550.00" });
  const income = (await db.query<Record<string, string>>(
    "select milk_income, cash_collected, other_income from report_period_summary('2026-10-10','2026-10-11')",
  )).rows[0];
  expect(income).toMatchObject({ milk_income: "0", cash_collected: "0", other_income: "0" });
  const accountRows = await db.query("select * from account_entries((select id from accounts where is_farm_cash limit 1))");
  expect(accountRows.rows).toHaveLength(0);
});

test("adjustments validate customer, date, amount, reason, month lock, and append-only history", async () => {
  const cash = (await db.query<{ id: string }>(
    "insert into customers(name,kind,opening_date) values ('Cash only','cash','2026-10-01') returning id",
  )).rows[0];
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-12',25,'Old due')",
    ["12345678-1234-4234-8234-123456789003", cash.id],
  )).resolves.toBeDefined();
  const free = (await db.query<{ id: string }>(
    "insert into customers(name,kind,opening_date,free_reason) values ('Free only','free','2026-10-01','charity') returning id",
  )).rows[0];
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-12',25,'Old due')",
    ["12345678-1234-4234-8234-123456789009", free.id],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_KIND_INVALID");
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-12',0,'Old due')",
    ["12345678-1234-4234-8234-123456789004", customerId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_INVALID");
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-09-30',25,'Old due')",
    ["12345678-1234-4234-8234-123456789005", customerId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_DATE_INVALID");
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-21',25,'Old due')",
    ["12345678-1234-4234-8234-123456789006", customerId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_DATE_INVALID");
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-12',25,'no')",
    ["12345678-1234-4234-8234-123456789007", customerId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_INVALID");
  await db.exec("reset role");
  await expect(db.query(
    "update customer_balance_adjustments set balance_change = 1 where id = $1",
    [adjustmentId],
  )).rejects.toThrow("CUSTOMER_BALANCE_ADJUSTMENT_APPEND_ONLY");
  await db.exec("insert into month_locks(month,note) values ('2026-10-01','test lock')");
  await db.exec("set role authenticated");
  await expect(db.query(
    "select record_customer_balance_adjustment($1,$2,'2026-10-12',25,'Old due')",
    ["12345678-1234-4234-8234-123456789008", customerId],
  )).rejects.toThrow("MONTH_LOCKED");
});

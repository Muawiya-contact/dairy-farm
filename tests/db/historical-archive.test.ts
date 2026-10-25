import { expect, test } from "vitest";
import { freshFarmDb } from "./db-fixture";
import { INSERT_HISTORICAL_ROWS_SQL } from "../../scripts/historical-sql.mjs";
import { buildHistoricalSql } from "../../scripts/build-historical-sql.mjs";
import { pgDateKey } from "../../scripts/historical-validate.mjs";

const hash = "a".repeat(64);
const rowHash = "b".repeat(64);
const insert = `insert into public.historical_records
  (source_key, kind, record_date, source_label, source_workbook, source_sheet,
   source_cell, source_file_sha256, row_sha256, litres, charged_rs)
  values ('${hash}', 'milk_day', '2026-09-30', 'Fictional buyer', 'fictional.xlsx',
          'Daily Milk', 'B31', '${hash}', '${rowHash}', 7.5, 1125)`;

test("historical rows are view-only and do not change live reports", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    const before = (await db.query("select * from public.customer_month_report('2026-09-01')")).rows;
    await db.exec(insert);
    await db.exec(`${insert} on conflict (source_key) do nothing`);
    expect((await db.query("select count(*)::int as n from historical_records")).rows).toEqual([{ n: 1 }]);
    expect((await db.query("select * from public.customer_month_report('2026-09-01')")).rows).toEqual(before);
    expect((await db.query("select count(*)::int as n from milk_deliveries")).rows).toEqual([{ n: 0 }]);
    await db.exec("set role anon");
    await expect(db.query("select * from historical_records")).rejects.toThrow();
    await expect(db.exec(insert)).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);

test("staging anonymous visitors can read only, never change, the fictional archive", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25", demoAccess: true });
  try {
    await db.exec(insert.replace("7.5, 1125", "7.5, 1125, '{\"demo\":true}'::jsonb")
      .replace("litres, charged_rs)", "litres, charged_rs, details)"));
    await db.exec(insert.replaceAll(hash, "c".repeat(64)).replaceAll(rowHash, "d".repeat(64)));
    await db.exec("set role anon");
    expect((await db.query("select source_label, litres from historical_records")).rows)
      .toEqual([{ source_label: "Fictional buyer", litres: "7.50" }]);
    await expect(db.exec(insert)).rejects.toThrow();
    await expect(db.exec(`delete from historical_records`)).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);

test("archive rejects negative litres and malformed source keys", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    await expect(db.exec(insert.replace("7.5, 1125", "-7.5, 1125"))).rejects.toThrow();
    await expect(db.exec(insert.replace(`'${hash}', 'milk_day'`, "'bad', 'milk_day'"))).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);

test("bulk loader keeps one row per source key on retry", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    const record = {
      source_key: hash, kind: "milk_day", record_date: "2026-09-30", source_label: "Fictional buyer",
      source_workbook: "fictional.xlsx", source_sheet: "Daily Milk", source_cell: "B31",
      source_file_sha256: hash, row_sha256: rowHash, litres: "7.50", charged_rs: "1125.00",
      paid_rs: "", remaining_rs: "", farm_debit_rs: "", home_debit_rs: "", daily_credit_rs: "",
      details: { source_note: "Fictional" }, flags: ["sample_flag"],
    };
    await db.query(INSERT_HISTORICAL_ROWS_SQL, [JSON.stringify([record])]);
    await db.query(INSERT_HISTORICAL_ROWS_SQL, [JSON.stringify([record])]);
    expect((await db.query("select count(*)::int as n, min(litres) as litres, min(flags[1]) as flag from historical_records")).rows)
      .toEqual([{ n: 1, litres: "7.50", flag: "sample_flag" }]);
  } finally { await db.close(); }
}, 30_000);

test("a verified customer link preserves the historical row and live balance", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    const customerId = "11111111-1111-4111-8111-111111111111";
    await db.exec(`insert into public.customers (id, name, kind, opening_date)
      values ('${customerId}', 'Fictional buyer', 'regular', '2026-10-01')`);
    const before = (await db.query("select * from public.customer_month_report('2026-09-01')")).rows;
    await db.exec(insert);
    await db.exec(`update public.historical_records set customer_id = '${customerId}' where source_key = '${hash}'`);
    expect((await db.query(`select customer_id, row_sha256 from public.historical_records where source_key = '${hash}'`)).rows)
      .toEqual([{ customer_id: customerId, row_sha256: rowHash }]);
    expect((await db.query("select * from public.customer_month_report('2026-09-01')")).rows).toEqual(before);
    await db.exec("set role anon");
    await expect(db.exec(`update public.historical_records set customer_id = null where source_key = '${hash}'`)).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);

test("non-customer historical evidence cannot be linked to a customer", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    const customerId = "11111111-1111-4111-8111-111111111111";
    await db.exec(`insert into public.customers (id, name, kind) values ('${customerId}', 'Fictional buyer', 'regular')`);
    await expect(db.exec(insert.replace("'milk_day'", "'expense_day'")
      .replace("charged_rs)", "charged_rs, customer_id)")
      .replace("7.5, 1125)", `7.5, 1125, '${customerId}')`))).rejects.toThrow();
  } finally { await db.close(); }
}, 30_000);

test("one-file SQL links only confirmed customers and can be retried", async () => {
  const db = await freshFarmDb({ farmDay: "2026-10-25" });
  try {
    const customerId = "11111111-1111-4111-8111-111111111111";
    await db.exec(`insert into public.customers (id, name, kind, opening_date)
      values ('${customerId}', 'Fictional buyer', 'regular', '2026-10-01')`);
    const customer = (await db.query(`select id, name, opening_balance, opening_date from public.customers where id = '${customerId}'`)).rows[0] as {
      id: string; name: string; opening_balance: string; opening_date: string | Date;
    };
    customer.opening_date = pgDateKey(customer.opening_date);
    const backup = { exported_at: new Date().toISOString(), row_counts: { customers: 1, historical_records: 0 }, tables: { customers: [customer] } };
    const record = {
      source_key: hash, kind: "milk_day", record_date: "2026-09-30", source_label: "Fictional buyer",
      canonical_label: null, source_workbook: "fictional.xlsx", source_sheet: "Daily Milk", source_cell: "B31",
      source_file_sha256: hash, row_sha256: rowHash, litres: "7.50", charged_rs: "1125.00",
      paid_rs: "", remaining_rs: "", farm_debit_rs: "", home_debit_rs: "", daily_credit_rs: "",
      details: {}, flags: [],
    };
    const unknown = { ...record, source_key: "c".repeat(64), row_sha256: "d".repeat(64), source_label: "Unconfirmed buyer" };
    const sql = buildHistoricalSql({ rows: [record, unknown] }, backup, [{ name: "Fictional buyer", id: customerId }])
      .replace("\\set ON_ERROR_STOP on\n", "");
    const before = (await db.query("select * from public.customer_month_report('2026-09-01')")).rows;
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query("select source_label, customer_id from public.historical_records order by source_label")).rows)
      .toEqual([{ source_label: "Fictional buyer", customer_id: customerId }, { source_label: "Unconfirmed buyer", customer_id: null }]);
    expect((await db.query("select * from public.customer_month_report('2026-09-01')")).rows).toEqual(before);
  } finally { await db.close(); }
}, 30_000);

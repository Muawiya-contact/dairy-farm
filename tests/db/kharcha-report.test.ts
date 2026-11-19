import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshFarmDb } from "./db-fixture";

let db: PGlite;
let account: string;
let wanda: string;
let home: string;
let personal: string;
let salary: string;
let staff: string;
let salaryPeriod: string;

beforeAll(async () => {
  db = await freshFarmDb({ farmDay: "2026-10-20" });
  account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
  wanda = (await db.query<{ id: string }>("select id from expense_categories where name = 'Wanda'")).rows[0].id;
  home = (await db.query<{ id: string }>("select id from expense_categories where name = 'Ghar ka kharcha'")).rows[0].id;
  personal = (await db.query<{ id: string }>("select id from expense_categories where name = 'Dukan bill'")).rows[0].id;
  salary = (await db.query<{ id: string }>("select id from expense_categories where is_salary")).rows[0].id;
  await db.exec("update accounts set opening_date = '2026-10-01'");
  staff = (await db.query<{ id: string }>("insert into staff(name) values ('Worker') returning id")).rows[0].id;
  salaryPeriod = (await db.query<{ id: string }>(
    "insert into salary_periods(staff_id,salary_month,agreed_amount) values ($1,'2026-10-01',1000) returning id",
    [staff],
  )).rows[0].id;
  await db.query(`
    insert into expenses(expense_date,category_id,account_id,amount,note,received_by) values
      ('2026-10-10',$1,$2,125,'Wanda purchase','Ali'),
      ('2026-10-10',$1,$2,75,'Second wanda purchase','Ali'),
      ('2026-10-10',$4,$2,20,'Tea','Bilal'),
      ('2026-10-12',$3,$2,50,'School fee','Sana'),
      ('2026-10-13',$4,$2,20,'Groceries',null)
  `, [wanda, account, home, personal]);
  await db.query(
    "insert into expenses(expense_date,category_id,account_id,amount,staff_id,salary_period_id,note) values ('2026-10-14',$1,$2,1000,$3,$4,'October salary')",
    [salary, account, staff, salaryPeriod],
  );
}, 30_000);

afterAll(async () => { await db?.close(); });

it("reports every expense once with reconciled farm, home, personal and category totals", async () => {
  const bounds = (await db.query<{ first_date: Date; last_date: Date }>("select * from kharcha_report_date_bounds()")).rows[0];
  expect(bounds.first_date.toISOString().slice(0, 10)).toBe("2026-10-10");
  expect(bounds.last_date.toISOString().slice(0, 10)).toBe("2026-10-20");

  const summary = (await db.query<{ entry_count: number; total_expenses: string; farm_expenses: string; home_expenses: string; personal_expenses: string }>(
    "select * from kharcha_report_summary('2026-10-10','2026-10-20',null)",
  )).rows[0];
  expect(summary).toEqual({ entry_count: 6, total_expenses: "1290.00", farm_expenses: "1200.00", home_expenses: "50.00", personal_expenses: "40.00" });
  const allTimeSummary = (await db.query(
    "select * from kharcha_report_summary($1,$2,null)", [bounds.first_date, bounds.last_date],
  )).rows[0];
  expect(allTimeSummary).toEqual(summary);

  const categories = (await db.query<{ category: string; expense_type: string; entry_count: number; total_amount: string }>(
    "select category, expense_type, entry_count, total_amount from kharcha_report_category_totals('2026-10-10','2026-10-20',null) order by category",
  )).rows;
  expect(categories).toEqual([
    { category: "Dukan bill", expense_type: "personal", entry_count: 2, total_amount: "40.00" },
    { category: "Ghar ka kharcha", expense_type: "home", entry_count: 1, total_amount: "50.00" },
    { category: "Tankhwah", expense_type: "farm", entry_count: 1, total_amount: "1000.00" },
    { category: "Wanda", expense_type: "farm", entry_count: 2, total_amount: "200.00" },
  ]);
  expect(categories.reduce((total, row) => total + Number(row.total_amount), 0)).toBe(Number(summary.total_expenses));

  const people = (await db.query<{ recipient: string }>("select * from kharcha_report_people('2026-10-10','2026-10-20')")).rows;
  expect(people).toEqual([{ recipient: "Ali" }, { recipient: "Bilal" }, { recipient: "Sana" }]);

  const page1 = (await db.query<Record<string, string>>(
    "select * from kharcha_report_rows('2026-10-10','2026-10-20',null,2,0)",
  )).rows;
  const page2 = (await db.query<Record<string, string>>(
    "select * from kharcha_report_rows('2026-10-10','2026-10-20',null,2,2)",
  )).rows;
  const page3 = (await db.query<Record<string, string>>(
    "select * from kharcha_report_rows('2026-10-10','2026-10-20',null,2,4)",
  )).rows;
  expect(page1).toHaveLength(2);
  expect(page2).toHaveLength(2);
  expect(page3).toHaveLength(2);
  expect(page1[0]).toMatchObject({ expense_date: new Date("2026-10-10T00:00:00.000Z"), category: "Wanda", account: "Farm galla", expense_type: "farm", recipient: "Ali" });
  expect(page1.map((row) => ({ description: row.description, amount: row.amount }))).toEqual(expect.arrayContaining([
    { description: "Wanda purchase", amount: "125.00" },
    { description: "Second wanda purchase", amount: "75.00" },
  ]));
  expect(page1[0].recipient).not.toBe(page1[0].account);
  expect([...page1, ...page2, ...page3]).toHaveLength(summary.entry_count);

  const oneDaySummary = (await db.query(
    "select * from kharcha_report_summary('2026-10-10','2026-10-10',null)",
  )).rows[0];
  expect(oneDaySummary).toEqual({ entry_count: 3, total_expenses: "220.00", farm_expenses: "200.00", home_expenses: "0", personal_expenses: "20.00" });

  const aliSummary = (await db.query<{ entry_count: number; total_expenses: string; farm_expenses: string; home_expenses: string; personal_expenses: string }>(
    "select * from kharcha_report_summary('2026-10-10','2026-10-20','Ali')",
  )).rows[0];
  expect(aliSummary).toEqual({ entry_count: 2, total_expenses: "200.00", farm_expenses: "200.00", home_expenses: "0", personal_expenses: "0" });
  const aliRows = (await db.query<Record<string, string>>(
    "select * from kharcha_report_rows('2026-10-10','2026-10-20','Ali',100,0)",
  )).rows;
  expect(aliRows).toHaveLength(2);
  expect(aliRows.every((row) => row.recipient === "Ali")).toBe(true);

  const schoolFee = (await db.query<Record<string, string>>(
    "select * from kharcha_report_rows('2026-10-12','2026-10-12',null,100,0)",
  )).rows;
  expect(schoolFee).toHaveLength(1);
  expect(schoolFee[0]).toMatchObject({ description: "School fee", category: "Ghar ka kharcha", expense_type: "home", amount: "50.00", recipient: "Sana" });

  await expect(db.query("select * from kharcha_report_summary('2026-10-12','2026-10-11',null)")).rejects.toThrow("KHARCHA_REPORT_PERIOD_INVALID");
  await expect(db.query("select * from kharcha_report_rows('2026-10-10','2026-10-21',null,100,0)")).rejects.toThrow("KHARCHA_REPORT_PERIOD_INVALID");
  await expect(db.query("select * from kharcha_report_rows('2026-10-10','2026-10-20',null,0,0)")).rejects.toThrow("KHARCHA_REPORT_PAGE_INVALID");
});

it("saves and audits recipient corrections through the existing guarded expense path", async () => {
  const expense = (await db.query<{ id: string }>(
    "insert into expenses(expense_date,category_id,account_id,amount,note) values ('2026-10-15',$1,$2,30,'Feed') returning id",
    [wanda, account],
  )).rows[0].id;
  const request = "66666666-6666-4666-8666-666666666666";
  const correction = `select correct_expense_with_recipient(
    $1,$2,1,'2026-10-15',$3,$4,30,'Feed',$5,'Recipient was not recorded'
  ) as revision`;
  expect((await db.query(correction, [request, expense, wanda, account, "Ali"])).rows).toEqual([{ revision: 2 }]);
  expect((await db.query(correction, [request, expense, wanda, account, "Ali"])).rows).toEqual([{ revision: 2 }]);
  await expect(db.query(correction, [request, expense, wanda, account, "Sana"])).rejects.toThrow("EXPENSE_REQUEST_CHANGED");
  expect((await db.query<{ received_by: string; revision: number }>(
    "select received_by,revision from expenses where id=$1", [expense],
  )).rows).toEqual([{ received_by: "Ali", revision: 2 }]);
  const audit = (await db.query<{ before_row: { received_by: string | null }; after_row: { received_by: string } }>(
    "select before_row,after_row from expense_audit where request_id=$1", [request],
  )).rows[0];
  expect(audit.before_row.received_by).toBeNull();
  expect(audit.after_row.received_by).toBe("Ali");
  await expect(db.query("update expenses set received_by='Sana' where id=$1", [expense])).rejects.toThrow("EXPENSE_USE_CORRECTION");
  await expect(db.query(
    "insert into expenses(expense_date,category_id,account_id,amount,received_by) values ('2026-10-16',$1,$2,10,'   ')",
    [wanda, account],
  )).rejects.toThrow(/expenses_received_by_valid/);
});

it("keeps kharcha reports owner-only and grants them to staging demo access explicitly", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from kharcha_report_date_bounds()")).rejects.toThrow(/permission|denied/i);
  await db.exec("reset role");

  const demo = await freshFarmDb({ farmDay: "2026-10-20", demoAccess: true });
  try {
    await demo.exec("set role anon");
    await expect(demo.query("select * from kharcha_report_date_bounds()")).resolves.toBeDefined();
    await expect(demo.query("select * from kharcha_report_summary('2026-10-10','2026-10-20',null)")).resolves.toBeDefined();
    await expect(demo.query("select * from kharcha_report_rows('2026-10-10','2026-10-20',null,100,0)")).resolves.toBeDefined();
  } finally { await demo.close(); }
});

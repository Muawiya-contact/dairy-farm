import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";

test("only the designated owner can read or write farm data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    for (const file of [
      "20261011000001_schema.sql", "20261011000002_reports.sql",
      "20261011000003_rls.sql", "20261011000004_defaults.sql",
      "20261011000005_open_preview.sql",
    ]) {
      await db.exec(readFileSync(resolve(migrationDir, file), "utf8"));
    }
    // Simulate a preview policy already deployed on one table before restoring it.
    await db.exec(`
      alter policy owner_all on settings rename to preview_all;
      alter policy preview_all on settings to anon, authenticated using (true) with check (true);
      grant select, update on settings to anon;
    `);
    await db.exec(readFileSync(resolve(migrationDir, "20261011000006_restore_owner_policy.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000007_demo_settings.sql"), "utf8"));
    await db.exec("update private.demo_access set enabled = true where id = 1");
    await db.exec(readFileSync(resolve(migrationDir, "20261012000008_live_app_data.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000009_create_customer.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000010_customer_opening_balance.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261012000011_health_event_expense.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000012_farm_cash_active.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000013_close_animal.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000014_animal_exit_activity.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000015_guard_animal_history_edits.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000016_breeding_records.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000017_insemination_dry_date.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261013000018_guard_breeding_subjects.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261014000019_farm_contact_phone.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261014000020_preserve_milk_entry_ids.sql"), "utf8"));
    await db.exec(readFileSync(resolve(migrationDir, "20261014000021_galla_workflow.sql"), "utf8"));
    await db.exec("update private.demo_access set enabled = false where id = 1");
    await db.exec(`
      insert into auth.users (id) values ('${owner}'), ('${stranger}');
      insert into private.app_owner (user_id) values ('${owner}');
      set role authenticated;
      set request.jwt.claim.sub = '${owner}';
    `);
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    expect((await db.query("select contact_phone from settings")).rows).toEqual([{ contact_phone: "" }]);
    await expect(db.exec("update settings set contact_phone = 'not a number' where id = 1")).rejects.toThrow(/settings_contact_phone_format/);
    await db.exec("update settings set contact_phone = '+923001234567' where id = 1");
    await expect(db.exec("update accounts set active = false where is_farm_cash")).rejects.toThrow(/accounts_farm_cash_active/);
    await db.exec("insert into animals (tag) values ('B-001')");
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);

    await db.exec(`set request.jwt.claim.sub = '${stranger}'`);
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    expect((await db.query("select tag from animal_status")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('B-002')")).rejects.toThrow();
    await expect(db.query("select user_id from private.app_owner")).rejects.toThrow();

    await db.exec("set role anon");
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("update settings set farm_name = 'Blocked' where id = 1 returning id")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
    await expect(db.exec("insert into animals (tag) values ('B-002')")).rejects.toThrow();
    await expect(db.query("select public.create_customer('Blocked', 'regular', '', 0, 0, 150, 0, public.farm_today())")).rejects.toThrow();
    await expect(db.query("select public.record_health_event(null, public.farm_today(), 'treatment', 'Blocked', 0, null, null, null)")).rejects.toThrow();

    await db.exec("reset role; update private.demo_access set enabled = true where id = 1; set role anon");
    expect((await db.query("select id from settings")).rows).toEqual([{ id: 1 }]);
    await db.exec("update settings set farm_name = 'Shared Demo' where id = 1");
    expect((await db.query("select farm_name from settings")).rows).toEqual([{ farm_name: "Shared Demo" }]);
    expect((await db.query("select tag from animals")).rows).toEqual([{ tag: "B-001" }]);
    await db.exec("insert into animals (tag) values ('B-002')");
    expect((await db.query("select tag from animals order by tag")).rows).toEqual([{ tag: "B-001" }, { tag: "B-002" }]);
    await db.exec("select public.save_milk_entry(public.farm_today(), 'morning', 10, 'total', '[]'::jsonb, '[]'::jsonb)");
    expect((await db.query("select total_litres from milk_shifts")).rows).toEqual([{ total_litres: "10.00" }]);
    await db.exec("select public.create_customer('Test customer', 'regular', '', 1, 1, 150, 1250, public.farm_today() - 7)");
    expect((await db.query("select name, opening_balance from customers")).rows).toEqual([{ name: "Test customer", opening_balance: "1250.00" }]);
    const openingDay = (await db.query<{ day: string }>("select public.farm_today() - 7 as day")).rows[0].day;
    expect((await db.query("select effective_from from customer_rates")).rows).toEqual([{ effective_from: openingDay }]);
    const category = (await db.query<{ id: string }>("select id from expense_categories where name = 'Dawai / vet'")).rows[0].id;
    const account = (await db.query<{ id: string }>("select id from accounts where is_farm_cash")).rows[0].id;
    const animal = (await db.query<{ id: string }>("select id from animals where tag = 'B-001'")).rows[0].id;
    const breedingAnimal = (await db.query<{ id: string }>("insert into animals (tag) values ('B-003') returning id")).rows[0].id;
    const breeding = (await db.query<{ id: string }>("insert into inseminations (animal_id, service_date, semen_name) values ($1, public.farm_today() - 270, 'Test bull') returning id", [breedingAnimal])).rows[0].id;
    const male = (await db.query<{ id: string }>("insert into animals (tag, sex, category) values ('B-MALE', 'male', 'bull') returning id")).rows[0].id;
    await expect(db.query("insert into inseminations (animal_id, service_date) values ($1, public.farm_today())", [male])).rejects.toThrow(/BREEDING_REQUIRES_FEMALE/);
    await expect(db.query("insert into calvings (animal_id, calving_date) values ($1, public.farm_today())", [male])).rejects.toThrow(/BREEDING_REQUIRES_FEMALE/);
    await expect(db.query("insert into inseminations (animal_id, service_date) values ($1, public.farm_today() + 1)", [breedingAnimal])).rejects.toThrow(/BREEDING_FUTURE_DATE/);
    const otherFemale = (await db.query<{ id: string }>("insert into animals (tag) values ('B-004') returning id")).rows[0].id;
    await expect(db.query("insert into calvings (animal_id, calving_date, insemination_id) values ($1, public.farm_today(), $2)", [otherFemale, breeding])).rejects.toThrow(/CALVING_INSEMINATION_MISMATCH/);
    expect((await db.query("select semen_name, status, updated_at is not null as versioned from inseminations where id = $1", [breeding])).rows).toEqual([{ semen_name: "Test bull", status: "pending", versioned: true }]);
    await expect(db.query("update inseminations set dry_off_date = public.farm_today() - 271 where id = $1", [breeding])).rejects.toThrow(/insem_dry_after_service/);
    await db.query("update inseminations set dry_off_date = public.farm_today() - 10 where id = $1", [breeding]);
    await expect(db.query("select public.record_calving($1, public.farm_today() - 271, 'alive')", [breeding])).rejects.toThrow(/CALVING_BEFORE_SERVICE/);
    await expect(db.query("select public.record_calving($1, public.farm_today() + 1, 'alive')", [breeding])).rejects.toThrow(/CALVING_FUTURE_DATE/);
    expect((await db.query("select count(*)::int as count from calvings")).rows).toEqual([{ count: 0 }]);
    await db.query("select public.record_calving($1, public.farm_today(), 'alive')", [breeding]);
    expect((await db.query("select c.outcome, i.status from calvings c join inseminations i on i.id = c.insemination_id where i.id = $1", [breeding])).rows).toEqual([{ outcome: "alive", status: "calved" }]);
    await expect(db.query("select public.record_calving($1, public.farm_today(), 'alive')", [breeding])).rejects.toThrow(/BREEDING_NOT_OPEN/);
    await db.query("select public.record_health_event($1, public.farm_today(), 'treatment', 'Vet visit', 250, null, $2, $3)", [animal, category, account]);
    expect((await db.query("select h.cost, e.amount, h.expense_id = e.id as linked from health_events h join expenses e on e.id = h.expense_id")).rows).toEqual([{ cost: "250.00", amount: "250.00", linked: true }]);
    expect((await db.query("select farm_expenses, profit from public.pnl_month(public.farm_today())")).rows).toEqual([{ farm_expenses: "250.00", profit: "-250.00" }]);
    await expect(db.query("select public.record_health_event($1, public.farm_today(), 'treatment', 'Incomplete', 250, null, null, null)", [animal])).rejects.toThrow();
    expect((await db.query("select count(*)::int as count from health_events")).rows).toEqual([{ count: 1 }]);

    await db.query("insert into health_events (animal_id, event_date, kind, title) values ($1, public.farm_today() - 1, 'checkup', 'Earlier checkup')", [animal]);
    await expect(db.query("update animals set birth_date = public.farm_today() where id = $1", [animal])).rejects.toThrow(/ANIMAL_BIRTH_AFTER_ACTIVITY/);
    const eveningShift = (await db.query<{ id: string }>("insert into milk_shifts (milk_date, shift, total_litres, mode) values (public.farm_today(), 'evening', 5, 'per_animal') returning id")).rows[0].id;
    await db.query("insert into animal_milk (shift_id, animal_id, litres) values ($1, $2, 5)", [eveningShift, animal]);
    await expect(db.query("update animals set sex = 'male', milking_status = 'none' where id = $1", [animal])).rejects.toThrow(/ANIMAL_HISTORY_SEX/);
    expect((await db.query("select sex from animals where id = $1", [animal])).rows).toEqual([{ sex: "female" }]);

    const invalidAccount = "33333333-3333-4333-8333-333333333333";
    await expect(db.query("select public.close_animal($1, 'sold', public.farm_today() - 1, 'Too early', 12000, $2)", [animal, account])).rejects.toThrow(/EXIT_BEFORE_ACTIVITY/);
    await expect(db.query("select public.close_animal($1, 'sold', public.farm_today(), 'Test sale', 12000, $2)", [animal, invalidAccount])).rejects.toThrow();
    expect((await db.query("select life_status from animals where id = $1", [animal])).rows).toEqual([{ life_status: "active" }]);
    await db.query("select public.close_animal($1, 'sold', public.farm_today(), 'Test sale', 12000, $2)", [animal, account]);
    expect((await db.query("select life_status, sale_price, milking_status from animals where id = $1", [animal])).rows).toEqual([{ life_status: "sold", sale_price: "12000.00", milking_status: "none" }]);
    expect((await db.query("select kind, amount, animal_id from other_income where animal_id = $1", [animal])).rows).toEqual([{ kind: "animal_sale", amount: "12000.00", animal_id: animal }]);
    expect((await db.query("select other_income from public.pnl_month(public.farm_today())")).rows).toEqual([{ other_income: "12000.00" }]);
    await expect(db.query("select public.close_animal($1, 'sold', public.farm_today(), null, 12000, $2)", [animal, account])).rejects.toThrow();
    expect((await db.query("select count(*)::int as count from other_income where animal_id = $1", [animal])).rows).toEqual([{ count: 1 }]);
    const otherAnimal = (await db.query<{ id: string }>("select id from animals where tag = 'B-002'")).rows[0].id;
    await db.query("select public.close_animal($1, 'dead', public.farm_today(), 'Illness', null, null)", [otherAnimal]);
    expect((await db.query("select life_status, exit_reason from animals where id = $1", [otherAnimal])).rows).toEqual([{ life_status: "dead", exit_reason: "Illness" }]);

    await db.exec("reset role; update private.demo_access set enabled = false where id = 1; set role anon");
    expect((await db.query("select id from settings")).rows).toEqual([]);
    expect((await db.query("update settings set farm_name = 'Blocked' where id = 1 returning id")).rows).toEqual([]);
    expect((await db.query("select tag from animals")).rows).toEqual([]);
  } finally {
    await db.close();
  }
});

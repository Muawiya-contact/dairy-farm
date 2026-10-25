// Build a private, one-command psql import. No customer workbook data is committed.
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backupIsFresh, sha256, validateArchive } from "./historical-validate.mjs";

const confirmedNames = ["Haider", "Imran", "Iqbal", "Mubashir", "Nestle", "Shaukat", "Munawar"];
const customerKinds = new Set(["milk_day", "customer_month"]);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function validateProductionInputs(archive, backup, sourceDir, now = Date.now()) {
  const { sourceHashes } = validateArchive(archive, "production");
  if (backup.format !== "dairy-farm-data-v1" || backup.source !== "production" ||
      !backup.tables || !backup.row_counts || sha256(JSON.stringify(backup.tables)) !== backup.tables_sha256 ||
      Object.keys(backup.tables).length !== Object.keys(backup.row_counts).length ||
      Object.entries(backup.tables).some(([name, rows]) => !Array.isArray(rows) || backup.row_counts[name] !== rows.length)) {
    throw new Error("Production backup checksum or row counts are invalid");
  }
  if (!backupIsFresh(backup.exported_at, now)) throw new Error("Take a fresh production backup within 24 hours");
  for (const [name, expected] of sourceHashes) {
    if (sha256(readFileSync(join(sourceDir, name))) !== expected) throw new Error(`Original workbook changed: ${name}`);
  }
  if (!Number.isSafeInteger(backup.row_counts.historical_records)) throw new Error("Backup lacks historical archive count");
  const customers = backup.tables.customers;
  if (!Array.isArray(customers)) throw new Error("Backup lacks customers");
  const byName = new Map(customers.map((customer) => [customer.name, customer]));
  if (byName.size !== customers.length || new Set(customers.map((customer) => customer.id)).size !== customers.length) {
    throw new Error("Backup has duplicate customer names or IDs");
  }
  const mappings = confirmedNames.map((name) => {
    const customer = byName.get(name);
    if (!customer || !uuid(customer.id)) throw new Error(`Confirmed customer missing from production backup: ${name}`);
    return { name, id: customer.id };
  });
  const names = new Set(confirmedNames);
  const linked = archive.rows.filter((row) => customerKinds.has(row.kind) && names.has(row.canonical_label || row.source_label)).length;
  const customerRows = archive.rows.filter((row) => customerKinds.has(row.kind)).length;
  return { mappings, linked, unlinked: customerRows - linked };
}

export function buildHistoricalSql(archive, backup, mappings) {
  const lines = [
    "-- PRIVATE CLIENT DATA. Keep this file outside Git and never use it on staging.",
    "-- Archive only: no INSERT/UPDATE/DELETE of customers, milk, payments or accounts.",
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local statement_timeout = '0';",
    "set local lock_timeout = '10s';",
    "set local standard_conforming_strings = on;",
    "select pg_advisory_xact_lock(hashtext('dairy-historical-import-v1'));",
    `do $$ begin
      if (select enabled from private.demo_access where id = 1) is distinct from false then
        raise exception 'Wrong database: expected production, not staging';
      end if;
      if to_regclass('public.historical_records') is null or
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'historical_records' and column_name = 'customer_id') then
        raise exception 'Apply the historical archive and customer-link migrations first';
      end if;
      if clock_timestamp() - ${quote(backup.exported_at)}::timestamptz > interval '24 hours' then
        raise exception 'Backup is over 24 hours old; generate SQL from a new backup';
      end if;
    end $$;`,
    "create temp table _expected_counts (table_name text primary key, rows bigint not null) on commit drop;",
    ...Object.entries(backup.row_counts).filter(([name]) => name !== "historical_records").map(([name, count]) => {
      if (!/^[a-z_]+$/.test(name) || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid backup table count");
      return `insert into _expected_counts values (${quote(name)}, ${count});`;
    }),
    `do $$ declare item record; actual bigint; begin
      for item in select * from _expected_counts loop
        execute format('select count(*) from public.%I', item.table_name) into actual;
        if actual <> item.rows then raise exception 'Production table % changed since backup: % versus %', item.table_name, actual, item.rows; end if;
      end loop;
    end $$;`,
    "create temp table _expected_customers (id uuid primary key, name text not null, opening_balance numeric, opening_date date) on commit drop;",
    ...backup.tables.customers.map((customer) => {
      if (!uuid(customer.id)) throw new Error("Invalid backup customer ID");
      const opening = customer.opening_balance == null ? "null" : String(customer.opening_balance);
      if (opening !== "null" && !/^-?\d+(?:\.\d+)?$/.test(opening)) throw new Error("Invalid backup opening balance");
      if (customer.opening_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(customer.opening_date)) throw new Error("Invalid backup opening date");
      return `insert into _expected_customers values (${quote(customer.id)}::uuid, ${quote(customer.name)}, ${opening}, ${customer.opening_date == null ? "null" : `${quote(customer.opening_date)}::date`});`;
    }),
    `do $$ begin
      if exists (
        select 1 from _expected_customers e full join public.customers c using (id)
        where e.id is null or c.id is null or c.name is distinct from e.name
           or c.opening_balance is distinct from e.opening_balance
           or c.opening_date is distinct from e.opening_date
      ) then raise exception 'Customer identity or opening balance changed since backup'; end if;
    end $$;`,
    "create temp table _identity_map (archive_label text primary key, customer_id uuid not null) on commit drop;",
    ...mappings.map(({ name, id }) => `insert into _identity_map values (${quote(name)}, ${quote(id)}::uuid);`),
    "create temp table _import_batches (batch jsonb not null) on commit drop;",
  ];
  for (let index = 0; index < archive.rows.length; index += 250) {
    lines.push(`insert into _import_batches values (${quote(JSON.stringify(archive.rows.slice(index, index + 250)))}::jsonb);`);
  }
  lines.push(`create temp table _import_rows on commit drop as
    select r.* from _import_batches b,
      lateral jsonb_to_recordset(b.batch) as r(
        source_key text, kind text, record_date text, source_label text, canonical_label text,
        source_workbook text, source_sheet text, source_cell text, source_file_sha256 text,
        row_sha256 text, litres text, charged_rs text, paid_rs text, remaining_rs text,
        farm_debit_rs text, home_debit_rs text, daily_credit_rs text, details jsonb, flags text[]
      );
  alter table _import_rows add primary key (source_key);
  do $$ begin
    if (select count(*) from _import_rows) <> ${archive.rows.length} then raise exception 'Import file row count changed'; end if;
    if exists (
      select 1 from _import_rows r join public.historical_records h using (source_key)
      where r.row_sha256 <> h.row_sha256
    ) then raise exception 'Existing source cell has different content'; end if;
    if exists (
      select 1 from _import_rows r join public.historical_records h using (source_key)
      left join _identity_map m on m.archive_label = coalesce(r.canonical_label, r.source_label)
      where h.customer_id is not null and h.customer_id is distinct from
        case when r.kind in ('milk_day', 'customer_month') then m.customer_id end
    ) then raise exception 'Existing historical customer link conflicts with confirmed identity'; end if;
  end $$;
  insert into public.historical_records
    (source_key, kind, record_date, source_label, canonical_label, source_workbook, source_sheet, source_cell,
     source_file_sha256, row_sha256, litres, charged_rs, paid_rs, remaining_rs,
     farm_debit_rs, home_debit_rs, daily_credit_rs, details, flags, customer_id)
  select r.source_key, r.kind, nullif(r.record_date, '')::date, r.source_label, r.canonical_label,
         r.source_workbook, r.source_sheet, r.source_cell, r.source_file_sha256, r.row_sha256,
         nullif(r.litres, '')::numeric, nullif(r.charged_rs, '')::numeric,
         nullif(r.paid_rs, '')::numeric, nullif(r.remaining_rs, '')::numeric,
         nullif(r.farm_debit_rs, '')::numeric, nullif(r.home_debit_rs, '')::numeric,
         nullif(r.daily_credit_rs, '')::numeric, r.details, r.flags,
         case when r.kind in ('milk_day', 'customer_month') then m.customer_id end
  from _import_rows r left join _identity_map m on m.archive_label = coalesce(r.canonical_label, r.source_label)
  on conflict (source_key) do nothing;
  update public.historical_records h set customer_id = m.customer_id
    from _import_rows r join _identity_map m on m.archive_label = coalesce(r.canonical_label, r.source_label)
    where h.source_key = r.source_key and r.kind in ('milk_day', 'customer_month')
      and h.customer_id is null;
  do $$ begin
    if (select count(*) from public.historical_records h join _import_rows r using (source_key)) <> ${archive.rows.length}
    then raise exception 'Post-import count mismatch'; end if;
    if exists (
      select 1 from public.historical_records h join _import_rows r using (source_key)
      left join _identity_map m on m.archive_label = coalesce(r.canonical_label, r.source_label)
      where h.row_sha256 <> r.row_sha256 or h.customer_id is distinct from
        case when r.kind in ('milk_day', 'customer_month') then m.customer_id end
    ) then raise exception 'Post-import content or customer link mismatch'; end if;
  end $$;
  select count(*) as imported_rows, count(customer_id) as linked_customer_rows
    from public.historical_records h join _import_rows r using (source_key);
  commit;`);
  return lines.join("\n") + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const archivePath = argument("--file");
  const backupPath = argument("--backup");
  const sourceDir = argument("--source-dir");
  const output = argument("--output");
  if (!archivePath || !backupPath || !sourceDir || !output) throw new Error("Use --file archive.json --backup current-production-backup.json --source-dir original-workbooks --output private.sql");
  const privateRelative = relative(resolve("client-data-review"), resolve(output));
  if (!privateRelative || privateRelative === ".." || privateRelative.startsWith(`..${sep}`) || privateRelative.startsWith(sep) || !output.endsWith(".sql")) {
    throw new Error("Private SQL output must be a .sql file inside the ignored client-data-review folder");
  }
  const archive = JSON.parse(readFileSync(archivePath, "utf8"));
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  const { mappings, linked, unlinked } = validateProductionInputs(archive, backup, sourceDir);
  writeFileSync(output, buildHistoricalSql(archive, backup, mappings), { mode: 0o600, flag: "wx" });
  console.log(`Private SQL created. ${archive.rows.length} archive rows; ${linked} linked customer entries; ${unlinked} unlinked customer entries. No database write.`);
}

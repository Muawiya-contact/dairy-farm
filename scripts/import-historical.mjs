// One-time, source-linked archive loader. It never writes operational tables.
// DATABASE_URL is supplied at runtime and must never be committed or printed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { INSERT_HISTORICAL_ROWS_SQL } from "./historical-sql.mjs";
import { pgDateKey, sameAsBackup, sha256, validateArchive } from "./historical-validate.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const file = argument("--file");
const target = argument("--target");
const apply = process.argv.includes("--apply");
const backupPath = argument("--backup");
const sourceDir = argument("--source-dir");
if (!file || !["staging", "production"].includes(target)) {
  throw new Error("Use --file archive.json --target staging|production [--apply]. Production also needs --backup and --source-dir.");
}
const archive = JSON.parse(readFileSync(file, "utf8"));
const { keys, sourceHashes } = validateArchive(archive, target);

if (target === "production") {
  if (!backupPath || !sourceDir) throw new Error("Production needs --backup and --source-dir");
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  if (backup.format !== "dairy-farm-data-v1" || backup.source !== "production" ||
      sha256(JSON.stringify(backup.tables)) !== backup.tables_sha256 ||
      Object.entries(backup.tables).some(([name, rows]) => backup.row_counts[name] !== rows.length)) throw new Error("Backup failed integrity checks");
  if (Math.abs(Date.now() - Date.parse(backup.exported_at)) > 24 * 60 * 60 * 1000) throw new Error("Take a fresh production backup within 24 hours");
  for (const [name, expected] of sourceHashes) {
    if (sha256(readFileSync(join(sourceDir, name))) !== expected) throw new Error(`Original workbook changed: ${name}`);
  }
}

const counts = Object.groupBy(archive.rows, (row) => row.kind);
console.log("Validated local archive:", archive.rows.length, "rows; kinds:", Object.fromEntries(Object.entries(counts).map(([key, rows]) => [key, rows.length])));
if (!process.env.DATABASE_URL) {
  if (apply) throw new Error("DATABASE_URL is required to apply an import");
  await new Promise((resolve) => process.stdout.write("Local validation only; no database connection or write.\n", resolve));
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("begin isolation level repeatable read");
  await client.query("set local statement_timeout = '60s'");
  const { rows: demo } = await client.query("select enabled from private.demo_access where id = 1");
  if (demo.length !== 1 || demo[0].enabled !== (target === "staging")) throw new Error("Database environment does not match --target");
  const { rows: archiveTable } = await client.query("select to_regclass('public.historical_records') as name");
  if (!archiveTable[0].name) throw new Error("Apply the historical archive migration first");
  if (target === "production") {
    const backup = JSON.parse(readFileSync(backupPath, "utf8"));
    for (const [name, expected] of Object.entries(backup.row_counts)) {
      if (!/^[a-z_]+$/.test(name)) throw new Error("Unexpected backup table name");
      const { rows } = await client.query(`select * from public."${name}"`);
      if (rows.length !== expected) throw new Error(`Production ${name} changed since backup; export again`);
      const key = name === "month_locks" ? "month" : name === "historical_records" ? "source_key" : "id";
      const remaining = new Map(backup.tables[name].map((row) => [pgDateKey(row[key]), row]));
      if (remaining.size !== expected) throw new Error(`Backup ${name} has duplicate keys`);
      for (const row of rows) {
        const saved = remaining.get(pgDateKey(row[key]));
        if (!saved || !sameAsBackup(row, saved)) throw new Error(`Production ${name} changed since backup; export again`);
        remaining.delete(pgDateKey(row[key]));
      }
    }
  }
  const existing = new Map();
  const allKeys = [...keys];
  for (let offset = 0; offset < allKeys.length; offset += 500) {
    const batch = allKeys.slice(offset, offset + 500);
    const { rows } = await client.query("select source_key, row_sha256 from public.historical_records where source_key = any($1::text[])", [batch]);
    for (const row of rows) existing.set(row.source_key, row.row_sha256);
  }
  for (const row of archive.rows) {
    const previous = existing.get(row.source_key);
    if (previous && previous !== row.row_sha256) throw new Error("An existing source cell has different content; investigate before retrying");
  }
  console.log("Database preflight:", existing.size, "already imported;", archive.rows.length - existing.size, "new rows");
  if (!apply) {
    await client.query("rollback");
    console.log("Dry run complete; database unchanged.");
  } else {
    for (let offset = 0; offset < archive.rows.length; offset += 250) {
      const batch = archive.rows.slice(offset, offset + 250);
      await client.query(INSERT_HISTORICAL_ROWS_SQL, [JSON.stringify(batch)]);
    }
    const { rows: final } = await client.query("select count(*)::int as count from public.historical_records where source_key = any($1::text[])", [allKeys]);
    if (final[0].count !== archive.rows.length) throw new Error("Post-import count mismatch; rolling back");
    await client.query("commit");
    console.log("Archive import committed:", archive.rows.length - existing.size, "new rows. Live ledger tables were not written.");
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally { await client.end(); }

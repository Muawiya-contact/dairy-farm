import { DATASETS, fetchDataset } from "./export-data";

export type FarmBackup = {
  format: "dairy-farm-data-v1";
  exported_at: string;
  source: string;
  row_counts: Record<string, number>;
  tables_sha256: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Download no partial file: every table must finish before the snapshot is built. */
export async function buildFarmBackup(fetchRows = fetchDataset): Promise<FarmBackup> {
  const tables: FarmBackup["tables"] = {};
  const counts: Record<string, number> = {};
  for (const dataset of DATASETS) {
    const rows = await fetchRows(dataset);
    tables[dataset.table] = rows;
    counts[dataset.table] = rows.length;
  }
  return {
    format: "dairy-farm-data-v1", exported_at: new Date().toISOString(),
    source: process.env.NEXT_PUBLIC_APP_ENV ?? "unknown", row_counts: counts,
    tables_sha256: await sha256(JSON.stringify(tables)), tables,
  };
}

export async function verifyFarmBackup(backup: FarmBackup): Promise<boolean> {
  if (backup.format !== "dairy-farm-data-v1" || typeof backup.tables !== "object" || !backup.tables) return false;
  for (const dataset of DATASETS) {
    const rows = backup.tables[dataset.table];
    if (!Array.isArray(rows) || backup.row_counts?.[dataset.table] !== rows.length) return false;
  }
  return (await sha256(JSON.stringify(backup.tables))) === backup.tables_sha256;
}

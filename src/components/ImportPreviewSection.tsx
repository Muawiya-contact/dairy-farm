"use client";

import { useState, type ChangeEvent } from "react";
import { todayPK } from "@/lib/dates";
import { downloadFile } from "@/lib/export-data";
import { IMPORT_TEMPLATES, parseCsv, previewImport, type ImportKind, type ImportPreview } from "@/lib/import-preview";
import { friendlyError } from "@/lib/errors";

const labels: Record<ImportKind, string> = { animals: "Janwar", customers: "Customers", accounts: "Accounts" };

async function readFile(file: File): Promise<string[][]> {
  if (file.size > 2_000_000) throw new RangeError("File 2 MB se chhoti rakhein.");
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new RangeError("CSV ya Excel .xlsx file chunein.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  // ExcelJS accepts binary browser data at runtime; its type definition only names Node Buffer.
  await workbook.xlsx.load((await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new RangeError("Excel file mein koi sheet nahi.");
  if (sheet.rowCount > 5001) throw new RangeError("Aik file mein 5000 se zyada rows na rakhein.");
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, line) => {
    matrix[line - 1] = Array.from({ length: row.cellCount }, (_, index) => {
      const value = row.getCell(index + 1).value;
      if (value == null) return "";
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value === "object") throw new RangeError(`Excel row ${line}: formula ya rich text ko plain value banayein.`);
      return String(value);
    });
  });
  return matrix;
}

export function ImportPreviewSection() {
  const [kind, setKind] = useState<ImportKind>("animals");
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const columns = [...IMPORT_TEMPLATES[kind]];
  const downloadTemplate = () => downloadFile(`dairy-${kind}-template.csv`, `${columns.join(",")}\r\n`, "text/csv;charset=utf-8");
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setResult(null); setError("");
    if (!file) return;
    setBusy(true);
    try { setResult(previewImport(await readFile(file), kind, todayPK())); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); event.target.value = ""; }
  };
  return <section className="max-w-2xl rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-display text-xl font-bold">Purana data tayyar karein</h2>
    <p className="mt-1 text-sm text-muted">Template mein records bharein. File yahan sirf is browser mein check hoti hai; Supabase mein koi row save nahi hoti. Client ki files milne ke baad actual import alag PR mein banega.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="font-semibold">Data ki qism<select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); setResult(null); setError(""); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-paper px-3"><option value="animals">Janwar</option><option value="customers">Customers</option><option value="accounts">Accounts</option></select></label>
      <label className="font-semibold">CSV ya Excel file<input type="file" accept=".csv,.xlsx" disabled={busy} onChange={(event) => void choose(event)} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-paper file:px-3" /></label>
    </div>
    <button type="button" onClick={downloadTemplate} className="mt-3 min-h-11 rounded-xl border border-berseem px-4 font-semibold text-berseem">{labels[kind]} template CSV download</button>
    <p className="mt-2 text-xs text-muted">Tareekhein YYYY-MM-DD mein likhein. Column names aur tartib template jaisi rakhein. Excel ki pehli sheet par data rakhein; formulas ki jagah plain values likhein. File 2 MB aur 5000 rows tak ho.</p>
    {busy && <p role="status" className="mt-3 text-muted">File check ho rahi hai…</p>}
    {error && <p role="alert" className="mt-3 text-udhaar">File nahi khuli: {error}</p>}
    {result && <div className="mt-4 border-t border-line pt-4">
      <p role="status" className="font-semibold">{result.count} rows dekhin · {result.issues.length} maslay · Supabase mein 0 rows save huin</p>
      {result.issues.length > 0 && <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5 text-sm text-udhaar">{result.issues.slice(0, 50).map((issue, index) => <li key={`${issue.row}-${index}`}>Row {issue.row}: {issue.message}</li>)}{result.issues.length > 50 && <li>Aur {result.issues.length - 50} maslay. File chhoti batches mein check karein.</li>}</ul>}
      {result.issues.length === 0 && <p className="mt-2 text-sm text-berseem-deep">Format aur basic values theek hain. Existing database records se duplicates aur relations import ke waqt alag check honge.</p>}
      {result.rows.length > 0 && <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line"><table className="min-w-full text-left text-xs"><thead className="bg-ground"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap p-2">{column}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={index} className="border-t border-line">{columns.map((column) => <td key={column} className="max-w-40 truncate p-2" title={row[column]}>{row[column] || "—"}</td>)}</tr>)}</tbody></table></div>}
    </div>}
  </section>;
}

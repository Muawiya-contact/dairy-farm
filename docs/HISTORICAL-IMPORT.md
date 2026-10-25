# Historical workbook archive

The client’s older workbooks contain daily totals, not morning/noon/evening
shifts. They also contain uncertain names, repeated labels, and monthly figures
that sometimes disagree with the day sheets. Store these as **source evidence**
in `historical_records`. Do not turn them into operational deliveries, payments,
expenses, animal events, or opening balances. The archive is view-only at
**Settings → Import / Backup / Export → Purana record dekhein**. It has month,
category, and page filters and shows the workbook/sheet/cell of each entry.

The archive has no effect on live Khata, Galla, milk totals, profit, or reports.
The regular farm backup includes its rows after the migration is applied.

## 25 October 2026 progress

Staging has the archive migration and 1,200 wholly fictional rows (240 of
each record kind). A repeated staging import left the count at 1,200. The
anonymous staging role can read but cannot change archive rows. The real
7,676-row extraction passed local source-key, row-digest, and workbook-hash
validation; it has **not** been written to staging or production. The supplied
production backup was used only for an overlap review and will need replacing
with a fresh backup immediately before a production import.

## Safety boundaries

- Keep the real XLSX files, extraction JSON, backup JSON, and reference PDF in
  the ignored `client-data-review/` folder. Never commit or upload them to
  public staging. The staging import file must contain fictional identities,
  dates, and amounts.
- Apply `20261025000001_historical_archive.sql` to staging before deploying the
  UI there. Confirm its `private.demo_access.enabled` setting is true. The
  migration gives anonymous visitors read-only archive access on staging.
- Run the importer without `--apply` first. The importer verifies row digests,
  unique source keys, original workbook SHA-256 digests, and the target
  environment. A second application inserts zero rows. A changed row at an
  existing source key stops the import rather than silently replacing it.
- For production, download a fresh Settings backup within 24 hours of import.
  The importer verifies the backup checksum and table row counts, and refuses
  the wrong environment. Run the migration only after the staging test and
  review of the deployment. Use a database administrator connection kept out of
  Git and chat. The import uses one transaction; failures roll back the batch.
- A backup exported before this migration will not contain historical rows.
  Download a new backup after a successful import and verify archive counts.
- Historical monthly summaries are displayed as written. They are not added to
  daily rows or to the live ledger. Resolve uncertain identities and balance
  carry-forward separately with the farm owner.

## Commands

Set `DATABASE_URL` privately to the **staging** database connection string.
Keep real records out of the staging file.

```bash
node scripts/import-historical.mjs --file client-data-review/historical-records-fictional-staging.json --target staging
node scripts/import-historical.mjs --file client-data-review/historical-records-fictional-staging.json --target staging --apply
node scripts/import-historical.mjs --file client-data-review/historical-records-fictional-staging.json --target staging --apply
```

The second apply must report zero new rows. Check a sample in the archive UI,
then switch to a **production** database connection and take a fresh Settings
backup. Never use the staging file for production.

```bash
node scripts/import-historical.mjs --file client-data-review/historical-records-private.json --target production --backup '/path/to/fresh-production-backup.json' --source-dir '/path/to/original-workbooks'
node scripts/import-historical.mjs --file client-data-review/historical-records-private.json --target production --backup '/path/to/fresh-production-backup.json' --source-dir '/path/to/original-workbooks' --apply
```

Verify archive row count and sample source cells in the production UI. Then
download a new production backup. Keep the first pre-import backup and original
workbooks secure. Do not edit live opening balances as part of this archive
import.

## Limits

The local combined PDF contains every source sheet as a reference. The
structured archive contains extracted daily customer rows, dated expense rows,
monthly customer summaries where a `Monthly Hisab` sheet exists, breeding rows,
and individual animal-tab events. Flagged source rows remain visibly flagged.
Undated breeding notes remain undated. This is not a verified reconstruction of
every historical cash balance or a replacement for the original workbooks.

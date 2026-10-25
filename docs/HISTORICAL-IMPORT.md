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

## Link old names to current customer profiles

Migration `20261025000003_historical_customer_link.sql` adds an optional
`customer_id` foreign key to the archive. The Khata customer page links to a
read-only archive filtered by that ID. This is a navigation and identity link;
historical charges and payments do **not** change the customer's opening
balance, current bill, payment history, Galla, or reports.

The owner confirmed these identities: old **Shoukat** is current **Shaukat**,
old **Munwar** is current **Munawar**, and Haider, Imran, Iqbal, Mubashir,
and Nestle match by name. **Shoukat Multani is a different person.** The
production import generator links only these seven verified current profiles.
Other labels, including possible customers, staff, free milk recipients, and
sheet totals, remain visible in the overall archive with no customer link.
Do not guess identities, create live customers, or carry forward historical
balances from those rows without a separate owner reconciliation.

### One-command production archive import

The private SQL file is generated locally from the validated extraction, the
original 17 XLSX files, and a production Settings backup taken within 24 hours.
The generator verifies workbook hashes, the backup checksum, all backup row
counts, and the seven confirmed customer IDs. It writes the SQL with mode 0600
under the ignored `client-data-review/` directory. It makes **no database
write**. The SQL checks the production environment, backup age, current table
counts, customer IDs/names/opening balances, and existing source hashes before
any insert. It then imports all rows and their verified customer links in one
transaction. A failure rolls it back. Repeating the same SQL on the same
database adds no duplicate archive rows.

Generate it after obtaining a new backup and while the original files are
available at the source directory:

```bash
node scripts/build-historical-sql.mjs \
  --file client-data-review/historical-records-private.json \
  --backup '/absolute/path/to/fresh-production-backup.json' \
  --source-dir '/absolute/path/to/original-workbooks' \
  --output client-data-review/production-historical-import.sql
```

Apply migration `20261025000003_historical_customer_link.sql` to production
with recorded migration history **after its code is merged to the production
branch**. Check `npx supabase migration list --project-ref
ylipnghdygpyqlptqazx` before `db push`; do not repeat a migration already
run manually in the SQL Editor. Then connect `psql` using a private production
database URL; never put a database password in Git, chat, or a shell command
that stores it in history. One command imports the whole SQL file:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f client-data-review/production-historical-import.sql
```

The output must end with `imported_rows = 7676`,
`linked_customer_rows = 1804`, and `COMMIT`. If the backup became stale or a
live table/customer changed, download a fresh production backup and regenerate
the SQL into a new private filename after reviewing the changes. Do not edit
the SQL's safety checks. After import, open one confirmed customer's **Purana
record dekhein** link, verify an unlinked label in the overall archive, and
download another full production backup. Keep both backups and the original
XLSX files privately.

## 25 October 2026 progress

Staging has both archive migrations and 1,200 wholly fictional rows (240 of
each record kind). A repeated staging import left the count at 1,200. The
anonymous staging role can read only rows marked fictional and cannot change
archive rows. The real
7,676-row extraction passed local source-key, row-digest, and workbook-hash
validation; it has **not** been written to staging or production. The supplied
production backup was used only for an overlap review and will need replacing
with a fresh backup immediately before a production import.

## Safety boundaries

- Keep the real XLSX files, extraction JSON, backup JSON, and reference PDF in
  the ignored `client-data-review/` folder. Never commit or upload them to
  public staging. The staging import file must contain fictional identities,
  dates, and amounts.
- Apply `20261025000001_historical_archive.sql` and
  `20261025000002_historical_demo_scope.sql` to staging before deploying the
  UI there. Confirm its `private.demo_access.enabled` setting is true. The
  policies give anonymous visitors read-only access to explicitly fictional
  archive rows on staging.
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

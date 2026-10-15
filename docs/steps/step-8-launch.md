# Step 8: Reports and launch preparation

## Scope

The existing dashboard, monthly reports, and CSV/Excel/PDF exports continue to
read Supabase. This PR adds an owner action for closing or reopening a complete
past month, an import **dry run**, and a read-only connection check in Settings.
The owner will handle backups separately. No backup scheduler, restore tool, or
Supabase plan change is included.

## Month close

In Settings, select a past month and close it after reconciling the reports.
The database rejects dated milk (including direct per-animal rows), delivery, payment, expense, transfer, income,
cash-count, and salary writes for a closed month. Changing an account opening
balance/date, a customer opening balance/date, or farm-versus-home expense
classification cannot silently rewrite a closed balance or profit. Reopening
requires a reason and typing the selected
month. Both actions write a dated audit event, including the signed-in actor
when one exists. Closing an already-closed month or reopening an already-open
one has no second effect. The database makes the final decision; transaction
locks serialize a close with dated writes.

The shared staging demo permits anonymous actions by design. Production only
permits its configured owner. Use staging records for rehearsal; do not close
production periods until the owner has checked the real books.

## Import preparation

Settings offers CSV templates for animals, customers, and accounts. CSV and
`.xlsx` files are read in the browser, validated, and previewed for up to 5,000
rows / 2 MB. The dry run checks columns, types, dates, amounts, basic business
rules, and duplicate tags or account names **within the file**. It does not
write to Supabase and cannot detect conflicts with existing database records.
The source files are not available yet, so there is no production import in
this PR. Before a later import: get the client's files, review mapping and
duplicates against staging, agree opening dates and balances with the owner,
then test an idempotent, transactional import on staging before production.
Never put real client records in the public staging demo.

## Connection and launch checks

The Settings connection button reads settings plus exact animal and customer
counts through the currently configured Supabase project. It displays whether
the site points at staging or production. A successful read proves those three
queries worked at that moment; it does not prove writes, migration parity, or
device sharing. On failure the owner sees a retryable error.

Before production cutover:

1. Confirm the latest migrations and generated database types on both projects.
2. Confirm Netlify main and previews point to the intended project; main is
   deliberately on staging during client testing. Switching main to production
   requires changing deployment configuration in a separate reviewed release.
3. Sign in as the production owner. Check a non-owner cannot read or mutate
   production records, and confirm production contains no invented staging data.
4. Run the read check and a controlled create/edit/report workflow on the
   deployed site, then check Supabase and Netlify logs for errors. Test a phone
   browser, including receipt PDF sharing, separately from desktop.
5. Import real records only after the files, mapping, duplicate resolution,
   and owner acceptance are available.

## Validation

Focused tests cover month/date validation; database tests cover owner-only
RPC access, idempotency, audit events, and closed-month indirect edits. Import
tests cover quoted CSV, malformed files, duplicate rows, negative opening
balances, date boundaries, and business rules. `npm run check` runs all Vitest
tests, ESLint, TypeScript, and a static build. Record browser, migration, and
hosted-preview results in the PR rather than assuming a build proves them.

Optional later work: transactional import, audited corrections to closed
periods, and automated alerts on deployment or database failures.

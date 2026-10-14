# Step 7: Mulazim aur tankhwah

## Owner workflow

Open **Kharcha → Mulazim aur tankhwah**. Add a worker with a name, optional job, and optional default monthly salary. Leave the default blank when pay varies; the owner must still agree a positive amount for each month. Pick a month and worker, then confirm that month's agreed amount. The default salary is only a starting value: changing it later does not rewrite older months. Before the first payment, the agreed amount can be corrected. Once any payment is saved, the agreed amount is locked so its history cannot silently change.

Enter each partial payment with its actual date, chosen active account, positive amount, and optional note. The screen shows **Tay shuda / Ada hui / Baqi** and lists the payments. A payment reduces the selected account's Galla balance and appears once as a farm expense on the payment date. An agreement by itself does not debit an account or reduce cash-basis profit. Staff may be marked inactive without erasing older salary records or balances. All labels and validation messages are Roman Urdu.

## Data and migrations

- `20261014000026_salary_periods.sql` creates `salary_periods` with one row per staff member and month, adds the salary period foreign key to `expenses`, and adds a `staff.updated_at` version for guarded edits. It backfills old salary expenses as fully paid in their payment month. If an old salary expense has no worker, migration stops for manual correction rather than inventing an owner. The salary category must be a farm expense.
- The expense trigger requires a salary category, staff, matching period, payment date from the start of that month, and a total paid no greater than agreed. It locks the period row while counting payments so concurrent submissions cannot both spend the same balance. Existing positive amount, active account/category, account opening date, future date, and month-lock rules still apply.
- `20261014000027_paid_salary_period_lock.sql` prevents changing an agreed amount after any payment. Before payment, month locks still prevent edits to closed periods. A paid record needs a separate audited correction workflow.
- `20261014000028_salary_history_guards.sql` prevents direct edits or deletion of linked salary payments, and prevents changing a category's salary classification after it has expenses. Ordinary non-salary expenses keep their existing correction rules.
- `salary_periods` follows the existing staging demo and production owner-only RLS policies. Only the publishable browser key is used. Staging contains fictional seed data; production receives schema and policies without a demo seed.
- Existing Galla account functions and the monthly profit report read salary payments from `expenses`. Stored amounts are `numeric(12,2)`; the browser compares display totals in integer cents. Settings exports salary periods and linked expenses in CSV, Excel, PDF, and the all-table JSON snapshot.

## Validation and checks

The form rejects blank, negative, zero where payment or agreement must be positive, excessive precision, future month/date, payment before the salary month or account opening, inactive account, and overpayment. The database repeats the critical checks for other clients and stale browser state. A client-generated UUID is retained across uncertain retries to avoid duplicate staff, period, or payment inserts. An edit of staff or unpaid agreed amount rejects a stale version rather than overwriting someone else's change.

PGlite migration tests cover old expense backfill, partial payments, Galla and profit totals, overpayment, missing or mismatched links, future months, advances, month locks, paid-period edits, direct payment edits/deletes, category reclassification, and staging versus owner-only access. Form unit tests cover valid and invalid money, month/date, account, and remaining-balance cases. Run `npm run check` and verify a staging preview with an empty month, a partial payment, a completed payment, failed validation, and refreshed totals before merging.

## Follow-up work

Salary advances and audited correction or reversal of paid entries are deferred. Other income and broader expense correction remain separate Step 7 work. A production switch also needs a planned release; current Netlify main and previews use staging.

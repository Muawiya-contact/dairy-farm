# Step 7: Ghar ka kharcha

## Owner workflow

On `/kharcha/`, choose **Ghar ka kharcha**, enter the date, explicitly choose the paying account, enter the amount and an optional note, then save. No account is preselected, so a farm expense cannot silently debit an arbitrary account. The form selects the dedicated home category automatically. Farm costs and other personal categories remain separate choices. The page shows monthly farm, home, and other personal expenses in distinct histories, and keeps the category breakdown visible. Labels are Roman Urdu.

The selected account loses the amount immediately in the Galla ledger. The database's `pnl_month` report counts it in `personal_expenses`, so it does not lower **Farm munafa**. The amount is a real cash expense; a free milk delivery to the home is a different record and must not be entered again as cash. Bank accounts in this app are manual ledger nicknames; no bank connection exists.

## Data and safeguards

Migration `20261014000024_home_expenses.sql` adds `Ghar ka kharcha` as an active nonfarm category on both Supabase projects. It refuses to silently reclassify an existing farm category with the same name and prevents the home category from becoming a farm or salary category. Migration `20261014000025_unique_home_category.sql` prevents a second home category with different case or surrounding spaces; it stops with a clear error if such duplicates already exist. The expense trigger guards inserts and edits against future dates, inactive accounts/categories, and dates before the paying account opened. Existing `numeric(12,2)`, positive-amount, foreign-key, row-level security, and month-lock rules remain in force. Production stays owner-only; staging allows shared demo access and fictional records only.

The browser validates the same date/account/category rules plus two-decimal precision before saving. It creates a UUID per proposed expense and retains that ID after an uncertain network result; retrying the same entry recognizes an already saved row. Success appears only after Supabase confirms the write. If the write succeeds but refreshed totals cannot load, the page says the record saved and asks for a reload. If a save may have succeeded but the connection failed, check the history before changing the form or submitting a new amount.

## Verification

- PGlite checks: one personal home category; account money decreases; `personal_expenses` rises; farm cost and profit stay unchanged; Galla contains the entry; future dates, inactive relations, opening dates, locked months, negative amounts, and production RLS are enforced.
- Unit checks: farm/home/other-personal category separation, valid home entry, invalid dates, negative/zero/overprecise amounts, inactive account/category, and account-opening boundary.
- Run `npm run check` for all tests, lint, TypeScript, and static build. Inspect the staging Deploy Preview at phone and laptop widths before merging. Confirm one fictional save and its Galla entry; leave production without demo records.

## Remaining Step 7 work

Staff and salary operations, other-income entry, and fuller expense correction/audit flows are separate work. They should follow the same account, date, lock, precision, retry, and report tests before their own PRs.

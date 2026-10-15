# Step 9: Release hardening and annual access

This release closes the remaining operational gaps across the farm workflow.
It requires database migrations `20261016000001` through `20261016000004`
on staging before preview testing, then on production before deploying the
production branch. A GitHub merge alone does not apply these migrations.

## Changes

- Animal closure, calving, and salary payment ask for confirmation before the
  transaction. Server rules remain authoritative if a request is repeated.
- A successful milk or animal write refreshes dependent views immediately.
  The active Gayein/Bhainsein lists exclude animals that left or died; their
  records remain available through the broader history filters.
- The main screens fetch relevant tables and date ranges, while export still
  deliberately pages through all rows. A detail page fetches that entity's
  history. This removes the old full-database read from routine navigation;
  very large individual histories still need future server pagination.
- Galla includes manual gobar and other income. Expense corrections keep the
  old and new rows, actor, reason, and a revision. Salary and linked health
  expenses cannot be corrected through this general form. Closed-month rules
  and account validation still apply.
- Customer creation retains one request ID across a retry, so a lost response
  can be checked without creating a second customer.
- Settings offers the manual farm-data JSON download described in
  [Step 8](step-8-launch.md). There is no password change in Settings.

## Annual fee rule

The private `farm_subscription` table has one optional `expires_on` date.
It starts blank, so this PR does not lock the farm on deployment. Only the
Supabase database administrator can change it; browser users cannot. To set
the last paid day, run this in the **intended project's** SQL Editor:

```sql
update private.farm_subscription
set expires_on = date '2027-10-15', updated_at = now()
where singleton = true;
```

Replace the example date with the agreed paid-through date. The app warns
users in Roman Urdu from seven days before that date through the date itself.
The warning has an X button; closing it hides the warning until the site is
opened again. Once the date has passed in Pakistan time, the warning explains
that records remain viewable. A small read-only strip remains after closing
the warning. Database triggers reject inserts, updates, and deletes, including
writes made through RPCs. Navigation and filters continue to work. Extending
`expires_on` restores writing without changing user accounts. Before a future
migration adds a writable public table, give it the same subscription trigger.

To remove an accidental date without deleting data:

```sql
update private.farm_subscription
set expires_on = null, updated_at = now()
where singleton = true;
```

The farm should communicate fee terms outside the app. The date is an access
control, not payment processing, invoicing, or automatic billing.

## Release verification

1. Review migration history and apply pending migrations to staging. Check
   an anonymous staging session, the reminder, a closed-month error, and
   one controlled transaction of each affected kind. Remove any test expiry.
2. Run `npm run check`; inspect the PR diff and the Netlify Deploy Preview at
   phone and desktop widths. Verify a real phone PDF share separately.
3. Apply the same migrations to production after staging acceptance. Leave the
   production expiry blank until the owner supplies the real paid-through date.
4. Compare the production branch with the approved staging release, then
   deploy that branch to the production Netlify site. Check owner and editor
   access, data isolation, warning dismissal, and a manual data download.
5. Store the JSON copy privately. It is not a complete PostgreSQL backup or
   a tested restore procedure. Document the exact migration and hosted-check
   results in the PR before merging.

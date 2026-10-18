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
It starts blank in a new installation. Only the Supabase database administrator
can change it; browser users cannot. The app warns users in Roman Urdu from
seven days before that date through the date itself.
The warning has an X button; closing it hides the warning until the site is
opened again. Once the date has passed in Pakistan time, the warning explains
that records remain viewable. A small read-only strip remains after closing
the warning. Database triggers reject inserts, updates, and deletes, including
writes made through RPCs. Navigation and filters continue to work. Extending
`expires_on` restores writing without changing user accounts. Before a future
migration adds a writable public table, give it the same subscription trigger.

Migration `20261018000001_subscription_guard_coverage.sql` closes a follow-up
gap: the month-close and reopen RPCs write to tables that do not have browser
`INSERT` grants, so the original grant-based trigger install missed them. It
also protects the server-written payment audit table. Apply this migration to
staging, then production, before claiming that expiry makes every workflow
read-only.

### Verify the production state without changing the date

In the **production** Supabase SQL Editor, run this read-only query. It must
return exactly one row. A blank `expires_on` means no warning or lock is
configured; it is not an automatic one-year subscription.

```sql
select expires_on, public.farm_today() as today_pk,
  case
    when expires_on is null then 'not configured'
    when expires_on < public.farm_today() then 'read only'
    when expires_on <= public.farm_today() + 7 then 'warning'
    else 'active'
  end as expected_state
from private.farm_subscription
where singleton = true;
```

After applying the follow-up migration, this read-only coverage check must
return **no rows**. If it lists a public table, investigate before relying on
the read-only lock:

```sql
select c.relname as unguarded_table
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c.oid and t.tgname = 'subscription_write_guard'
      and not t.tgisinternal
  )
order by c.relname;
```

If the real paid-through date is within seven days, the production site shows
the warning; X hides it until the site is opened again. After that date, the
site shows the read-only notice and the database blocks changes. Verify the
expired write behavior with automated tests or in staging; do not set a false
past expiry in production just to exercise the lock.

### Renew access after the client pays

This is an owner-directed database operation, not a button in Settings. The
owner's renewal request should state that payment was received and give the
exact **last paid day** in `YYYY-MM-DD` format. If either fact is missing, ask
for it. Do not assume payment or calculate a new date from today's date. Keep
payment evidence outside this repository. No password, database connection
string, service-role key, or receipt belongs in Git or chat. A routine renewal
is a database value change; it needs no new migration, Git commit, or site
deployment.

1. Open the **production** Supabase project `ylipnghdygpyqlptqazx` and its
   SQL Editor. The staging project `dlirssfoazlxzyamsltv` contains fictional
   data and must not be used for a real renewal. Check the project identity
   before running any update.
2. Read the existing value first. This query must return exactly one row:

   ```sql
   select expires_on, public.farm_today() as today_pk
   from private.farm_subscription
   where singleton = true;
   ```

   `null` means there is no subscription lock. A date equal to or later than
   `today_pk` permits writes through that day; an earlier date makes the app
   read-only. If there is no row or the project is unexpected, stop and
   investigate instead of inserting a replacement row.
3. After the owner supplies the paid-through date, replace the placeholder
   below with that exact date and run the update as a database administrator:

   ```sql
   update private.farm_subscription
   set expires_on = date 'YYYY-MM-DD', updated_at = now()
   where singleton = true
   returning expires_on;
   ```

   The result must contain one row with the intended date. Re-run the read
   query, then refresh the production website. A paid-through date of today or
   later restores writes without changing accounts or redeploying. Report the
   project and saved paid-through date to the owner; do not claim that the app
   processed a payment.

Only for an owner-authorized correction, clear an accidental date without
deleting farm data:

```sql
update private.farm_subscription
set expires_on = null, updated_at = now()
where singleton = true
returning expires_on;
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

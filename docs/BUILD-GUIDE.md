# Build guide

This is a practical version of the supplied build guide for the files that
actually exist in this repository. Use the detailed [Step 1 plan](steps/step-1-foundation.md)
for future implementation work.

## Database development loop

1. Add a migration for each schema or money-rule change. Keep earlier
   migrations immutable after deployment.
2. Add a PGlite test under `tests/db/` for the rule, including an access-policy
   test when a table or function is added.
3. Change one screen and its small data-access function at a time. Remove only
   that screen's mock data after its staging flow works.
4. Run `npm run check` and review the diff before committing.
5. Apply migrations to **staging** and test with invented data. Apply to the
   production project only during a planned release.

The [staging seed](../supabase/seed/dev-demo.sql) gives seven invented customers,
fourteen animals, fourteen days of milk, transactions, and alerts. It is for a
fresh staging database only. Its [test](../tests/db/dev-demo.test.ts) checks
milk totals, the farm cash balance, one customer balance, and herd alerts.

## Review loop

Every PR should pass `npm run check`, keep the Netlify deploy preview
available for visual review, and report which flows were checked in the
browser. A green local seed test proves that the SQL loads in PGlite; it does
not prove the hosted Supabase project has been migrated or that its Auth and
Row Level Security settings work end to end.

For each connected screen, check loading, empty, error, and normal states on a
phone-size viewport and a laptop. Check failed saves while offline. Keep
Roman Urdu text consistent with the approved preview.

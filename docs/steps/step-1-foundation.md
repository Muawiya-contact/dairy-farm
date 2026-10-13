# Step 1: database and app foundation

This adapts the supplied `step-1-foundation.md`. It records the original
foundation plan and the current database setup.

Database status on 2026-10-12: eleven migrations are recorded in both hosted
projects. The staging seed contains invented records. Staging preview visitors
can read and edit shared demo records; production remains owner restricted.
All current app screens use Supabase.

## Initial setup procedure

1. Create a separate Supabase project named `dairy-staging` under the owner's
   account. Keep the existing `dairy` project reserved for real client data.
2. Dry-run and apply the files in `supabase/migrations/` to staging first, then
   production, using the Supabase CLI so migration history is recorded. The
   current sequence is `20261011000001` through `20261012000011`; the defaults
   are already in migration `000004`. There is no `base.sql` in this repository.
3. On the fresh staging project, run `supabase/seed/dev-demo.sql` once with
   `supabase db query --linked --project-ref dlirssfoazlxzyamsltv --file supabase/seed/dev-demo.sql`.
   The seed uses relative farm dates and is not idempotent. Never run it against
   the project holding client data.
4. Verify that anonymous requests cannot read production farm tables. Set
   `private.demo_access.enabled = true` in staging only. During the demo phase,
   Netlify's main site and previews use staging; the real-data project still
   requires owner sign-in.

Do not use `supabase db reset --linked` for the client-data project: it deletes
remote data. Do not paste schema migrations into SQL Editor, because that would
leave migration history out of sync.

## Original foundation work plan

- Add Pakistani farm-day helpers, rupee/litre parsing, and friendly Roman Urdu
  error messages with unit tests.
- Centralize visible UI text and add typed data-access functions. Keep money
  balances and reports in Postgres rather than recomputing them in screens.
- The owner approved a no-login, shared staging demo. Only staging Settings have
  anonymous read/update access; decide production authentication before wiring
  live client data.
- Settings are connected in staging. Replace mock data one screen at a time.
  Keep the static export and its Netlify preview working throughout.
- For database-backed detail pages, use query parameters instead of dynamic
  path segments that static export cannot enumerate.

Current verification: `npm run check` passes, staging screens load shared demo
records, and browser milk entries save to staging. Anonymous production access
is denied. Owner login has not been exercised end-to-end because the owner
password is not available to this task.

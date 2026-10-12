# Step 1: database and app foundation

This adapts the supplied `step-1-foundation.md` to the current no-login demo.
It is a plan for later app work, not a claim that the listed features are done.

Database status on 2026-10-12: all seven migrations are recorded in both hosted
projects. The staging seed has been loaded once. Anonymous visitors can read
and update staging Settings after its demo switch was enabled, while production
Settings and all other farm tables remain owner restricted. The app still uses
browser mock data for every screen except staging Settings.

## Initial setup procedure

1. Create a separate Supabase project named `dairy-staging` under the owner's
   account. Keep the existing `dairy` project reserved for real client data.
2. Dry-run and apply the files in `supabase/migrations/` to staging first, then
   production, using the Supabase CLI so migration history is recorded. The
   current sequence is `20261011000001` through `20261012000007`; the defaults
   are already in migration `000004`. There is no `base.sql` in this repository.
3. On the fresh staging project, run `supabase/seed/dev-demo.sql` once with
   `supabase db query --linked --project-ref dlirssfoazlxzyamsltv --file supabase/seed/dev-demo.sql`.
   The seed uses relative farm dates and is not idempotent. Never run it against
   the project holding client data.
4. Verify that anonymous requests cannot read production Settings or any other
   farm table. Only staging Settings are shared: after migration `000007`, set
   `private.demo_access.enabled = true` in staging only. The Netlify preview
   uses Supabase for that form and local mock data elsewhere.

Do not use `supabase db reset --linked` for the client-data project: it deletes
remote data. Do not paste schema migrations into SQL Editor, because that would
leave migration history out of sync.

## App foundation to build after staging is ready

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

Before calling this step done, run `npm run check`, test login and settings on
staging if those features are built, and verify RLS using an anonymous request
and the designated owner. Anonymous denial was verified on both hosted projects;
owner login and the remaining database-backed screens have not been implemented.

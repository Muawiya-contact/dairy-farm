# Step 1: database and app foundation

This adapts the supplied `step-1-foundation.md` to the current no-login demo.
It is a plan for later app work, not a claim that the listed features are done.

## Set up staging first

1. Create a separate Supabase project named `dairy-staging` under the owner's
   account. Keep the existing `dairy` project reserved for real client data.
2. Apply the files in `supabase/migrations/` to **staging only**, in filename
   order, using the Supabase CLI so migration history is recorded. The current
   sequence is `20261011000001` through `20261011000006`; the defaults are
   already in migration `000004`. There is no `base.sql` in this repository.
3. On the fresh staging project, run `supabase/seed/dev-demo.sql` once in the
   SQL Editor. The seed uses relative farm dates and is not intended to be
   idempotent. Never run it against the project holding client data.
4. Verify that anonymous requests cannot read farm tables. The current RLS
   policy grants farm access only to the designated owner account; the public
   Netlify preview still uses local mock data.

Do not use `supabase db reset --linked` for the client-data project: it deletes
remote data. Do not paste schema migrations into SQL Editor, because that would
leave migration history out of sync.

## App foundation to build after staging is ready

- Add Pakistani farm-day helpers, rupee/litre parsing, and friendly Roman Urdu
  error messages with unit tests.
- Centralize visible UI text and add typed data-access functions. Keep money
  balances and reports in Postgres rather than recomputing them in screens.
- Decide the access flow with the owner before wiring browser screens to
  Supabase. The supplied plan proposes owner login; the current preview was
  deliberately approved without login and cannot use the owner-only database
  anonymously.
- Connect settings first, then replace mock data one screen at a time. Keep the
  static export and its Netlify preview working throughout.
- For database-backed detail pages, use query parameters instead of dynamic
  path segments that static export cannot enumerate.

Before calling this step done, run `npm run check`, test login and settings on
staging if those features are built, and verify RLS using an anonymous request
and the designated owner. None of these hosted checks has been completed yet.

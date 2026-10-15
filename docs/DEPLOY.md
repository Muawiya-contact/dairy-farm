# Staging and production deployment

The Next.js static export is built into `out`. Public Supabase values are frozen into the browser bundle during `npm run build`. This repository contains no site credentials in `netlify.toml`.

| Environment | Netlify site | Git branch | Supabase project | Access |
|---|---|---|---|---|
| Staging demo | Existing `demo-dairy-app` site (optional rename) | `main` and PR previews | `dlirssfoazlxzyamsltv` | Fictional shared demo data |
| Production | Separate site, created for launch | `production` only | `ylipnghdygpyqlptqazx` | Owner sign-in and real data |

In **Project configuration → Environment variables**, set these as site-level **Builds** values for all deploy contexts on the existing staging site, before merging the environment-split PR:

```text
NEXT_PUBLIC_SUPABASE_URL=https://dlirssfoazlxzyamsltv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_APP_ENV=staging
```

The publishable key is safe for the browser; service-role keys, access tokens and database passwords are not. A build fails if a required value is missing, if its Supabase project does not match `NEXT_PUBLIC_APP_ENV`, or if production does not require sign-in. Staging displays a demo banner on every screen.

For the future **separate production Netlify site**, connect this repository to the `production` branch, disable deploy previews and other branch deploys for that site, and set its site-level Builds variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://ylipnghdygpyqlptqazx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<production publishable key>
NEXT_PUBLIC_REQUIRE_AUTH=true
NEXT_PUBLIC_APP_ENV=production
```

Set Supabase Auth's Site URL and allowed redirect URLs to the final production address. Keep production RLS owner-only. Production already has versioned migrations and generic defaults as of Step 8; check migration parity for later changes. Never apply `supabase/seed/dev-demo.sql`, `supabase/seed/test-*.sql`, or real client records to the staging demo.

Release sequence: test a PR preview on staging; merge to `main` after owner review; update `production` from `main` only when the owner chooses to release; verify production build, owner login, read/write flow, reports and logs. No Git merge or production cutover happens automatically through this document. The owner handles periodic backups separately.

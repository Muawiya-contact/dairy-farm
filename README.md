# Dairy Farm App

A Roman Urdu dairy farm web app for phone and laptop. The dashboard, animals, milk shifts, customer accounts, expenses, and Settings read from Supabase. Entries save to Supabase and refresh the affected screens. The app contains no hardcoded farm dataset.

## Environments

| Site | Supabase project | Access | Data |
|---|---|---|---|
| Netlify main site / Deploy Preview / branch deploy | `dlirssfoazlxzyamsltv` | Shared demo, no sign-in | Invented demo records |
| Reserved Supabase project for real data | `ylipnghdygpyqlptqazx` | Owner sign-in and row level security | Live records only |

The staging and real-data databases are separate projects. During the demo phase, every Netlify deploy, including the main site, uses staging through `netlify.toml`. Anyone with the main site or a preview link can change staging demo data, so never enter real client information there. The reserved real-data project still requires the Supabase owner account and keeps anonymous table access disabled. There is no browser toggle between databases. The browser uses only publishable keys; do not put secret keys or database passwords in the app.

## Screens

- `/`: database backed milk, finance, herd and alert dashboard
- `/janwar/`: search, add animal, details, health and breeding entries (`?id=<uuid>`)
- `/doodh/`: morning and evening milk production, animal quantities and customer deliveries
- `/khata/`: add customers, view database balances and bills, record payments, company bills, WhatsApp bill (`?id=<uuid>`)
- `/kharcha/`: expense and profit report, categories, accounts and entries
- `/settings/`: shared farm settings, breeding-day offsets and account controls

Animal and customer detail links use query parameters because Next.js static export cannot build pages for database IDs that do not exist at build time.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the staging project values from `netlify.toml`. Keep `.env.local` ignored. Open http://localhost:3000. To test the production project locally, also set `NEXT_PUBLIC_REQUIRE_AUTH=true` and use the production URL and publishable key.

## Deploy to Netlify

Import `Muawiya-contact/dairy-farm` from Git. Leave Base directory and Functions directory empty. The build command is `npm run build`; Publish directory is `out`. Netlify reads these values and the environment mapping from `netlify.toml`. The `out` folder is generated during the build and is intentionally absent from GitHub.

## Database

Twelve migrations in `supabase/migrations/` are recorded on both projects as of 2026-10-13. Apply future schema changes with the Supabase CLI so migration history stays in sync. Staging alone contains the invented records from `supabase/seed/dev-demo.sql`; production has no demo customers or animals. Database triggers and report functions calculate delivery amounts, customer balances and profit. The staging access switch is `private.demo_access.enabled = true`; production keeps it `false`.

`npm run db:types` refreshes TypeScript database types from staging. It requires Supabase CLI login. CI runs tests, lint, typecheck and the static export build on pushes and pull requests.

Run `npm run check` before pushing. The database tests use PGlite and cover owner access, staging preview access and demo data. The current project plan is in [docs/ROADMAP.md](docs/ROADMAP.md).

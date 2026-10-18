# Dairy Farm App

A Roman Urdu dairy farm web app for phone and laptop. The dashboard, animals, milk shifts, customer accounts, expenses, and Settings read from Supabase. Entries save to Supabase and refresh the affected screens. The app contains no hardcoded farm dataset.

## License

This project is available under the [MIT License](LICENSE). You may use, modify, and redistribute it, including for your own local installation, as long as you keep the copyright and license notice. The included milk-churn logo may also be reused under MIT. Set your own farm name in **Settings → Farm ka naam** when deploying your installation. The bundled fonts have their own license in [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt).

## Environments

| Site | Supabase project | Access | Data |
|---|---|---|---|
| Netlify main site / Deploy Preview / branch deploy | `dlirssfoazlxzyamsltv` | Shared demo, no sign-in | Invented demo records |
| Reserved Supabase project for real data | `ylipnghdygpyqlptqazx` | Owner sign-in and row level security | Live records only |

The staging and real-data databases are separate projects. The current Netlify site uses staging values set in its dashboard; `netlify.toml` contains build settings only. Anyone with the main site or a preview link can change staging demo data, so never enter real client information there. The reserved real-data project still requires the Supabase owner account and keeps anonymous table access disabled. There is no browser toggle between databases. The browser uses only publishable keys; do not put secret keys or database passwords in the app. See [deployment steps](docs/DEPLOY.md).

## Screens

- `/`: database backed milk, finance, herd and alert dashboard
- `/janwar/`: search, add animal, details, health and breeding entries (`?id=<uuid>`)
- `/doodh/`: morning and evening milk production, animal quantities and customer deliveries
- `/khata/`: add and edit customers, view monthly database balances and detailed PDF bills, record payments and company bills, download or share payment receipts (`?id=<uuid>`)
- `/galla/`: account ledger, manual transfers, cash counts and reconciliation
- `/kharcha/`: farm, home and other personal expenses with separate history, profit, categories and accounts
- `/salary/`: staff, monthly agreed salary, partial payments and remaining balance
- `/settings/`: shared farm settings, breeding-day offsets and account controls

Animal and customer detail links use query parameters because Next.js static export cannot build pages for database IDs that do not exist at build time.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the four `NEXT_PUBLIC_*` variables in `.env.local` for the desired project. For staging, use its URL and publishable key, `NEXT_PUBLIC_APP_ENV=staging`, and `NEXT_PUBLIC_REQUIRE_AUTH=false`. Keep `.env.local` ignored. Open http://localhost:3000. A production build needs the production URL/key, `NEXT_PUBLIC_APP_ENV=production`, and `NEXT_PUBLIC_REQUIRE_AUTH=true`.

## Deploy to Netlify

Import `Muawiya-contact/dairy-farm` from Git. Leave Base directory and Functions directory empty. The build command is `npm run build`; Publish directory is `out`. Set the public build variables in each Netlify site's dashboard as described in [deployment steps](docs/DEPLOY.md). The `out` folder is generated during the build and is intentionally absent from GitHub.

## Database

Forty-one migrations are recorded on both projects as of Step 8. Apply future schema changes with the Supabase CLI so migration history stays in sync. Staging alone contains the invented records from `supabase/seed/dev-demo.sql`; no demo seed was applied to production. Database triggers and report functions calculate delivery amounts, customer balances and profit. The staging access switch is `private.demo_access.enabled = true`; production keeps it `false`. Step 6 money rules are described in [docs/steps/step-6-galla.md](docs/steps/step-6-galla.md); the home-expense and salary workflows are in [docs/steps/step-7-kharcha.md](docs/steps/step-7-kharcha.md) and [docs/steps/step-7-salary.md](docs/steps/step-7-salary.md).

Set the optional farm contact number in Settings before sending customer documents. A statement PDF includes the selected month's saved deliveries, company bills and payments; a receipt PDF confirms one payment. On phones that support file sharing, **PDF share** passes the file to the system share sheet; the owner chooses WhatsApp and the recipient, checks the draft, and sends it. If the browser loses the click permission while building a PDF, the same button can retry with the prepared file. **WhatsApp chat + PDF** opens a new chat tab with prefilled text and downloads the PDF. On a computer, the owner attaches that download in WhatsApp Web and presses Send. The site cannot select an app or recipient in the system sheet or attach a local file inside another website's tab. No document is sent automatically.

The animal page records semen details, checkups and calving against existing Supabase tables. Settings offers CSV, Excel and PDF exports for all 22 public tables, a joined breeding register, and monthly customer, expense, milk and profit reports. It also offers an all-table JSON snapshot. The `/reports/` page displays a printable monthly report; browser print can save it as PDF. Export files are generated in the browser from the currently connected project and are not backups of Supabase users, storage or Auth configuration.

`npm run db:types` refreshes TypeScript database types from staging. It requires Supabase CLI login. CI runs tests, lint, typecheck and the static export build on pushes and pull requests.

Run `npm run check` before pushing. The database tests use PGlite and cover owner access, staging preview access and demo data. The [roadmap](docs/ROADMAP.md) and [implementation documentation](docs/DOCUMENTATION.md) track each step and its acceptance criteria.

## How to run tests

```bash
npm test
npx supabase start
npx playwright install chromium
npm run e2e
```

The browser suite requires Docker or another Docker-compatible runtime. `npm run e2e` **resets only the local Supabase database** with every migration, then loads the fictional `dev-demo.sql` and E2E fixtures after checking the local database URL. Configured Supabase seeding is disabled so a linked reset cannot load those fixtures. The runner creates a temporary local owner login, builds the static export with `NEXT_PUBLIC_APP_ENV=test`, and serves it at `http://127.0.0.1:4173`. The build guard accepts test mode only with a localhost Supabase URL. Never point this suite at a linked or hosted project. The local login is regenerated for each run and ignored by Git. CI runs the same mobile and desktop Chromium flows and keeps traces when a test fails.

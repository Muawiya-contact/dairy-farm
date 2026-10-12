# Dairy Farm App (preview)

The app opens without login. On Netlify Deploy Previews and branch deploys, Settings load from and save to the shared staging Supabase project. The dashboard, animals, milk, customer ledger, and expenses still show dummy records; their save buttons do not persist data yet. On the production site, Settings still use this browser's local storage until the owner-only live data flow is built.
Language: Roman Urdu. Works on phone and laptop.

Anyone with a staging preview link can edit its shared demo Settings without signing in. Use invented data there; production stays owner restricted.

## Screens

| Route | Screen |
|---|---|
| `/` | Dashboard: aaj ka doodh, aaj ka hisaab, munafa/nuqsaan (roz, mahana, saalana), janwar summary, alerts |
| `/janwar/` | Janwar list with search and filters |
| `/janwar/[id]/` | Janwar detail: info, 7 din ka doodh, mahana andaza, nasl kashi (auto delivery date), sehat ka record |
| `/doodh/` | Doodh entry: subah/shaam, kul ya har janwar, customers ko diya, "sab roz jaisa", collection center |
| `/khata/` | Customers with udhaar |
| `/khata/[id]/` | Customer bill, register (bahi khata), wusooli, WhatsApp bill |
| `/kharcha/` | Naya kharcha, category breakdown, har janwar ki bachat |

Only the Settings form saves. Its staging version writes to Supabase, while its production version uses local storage. The other forms remain demo interactions.

## Where things are

- `src/lib/mock-data.ts`: dummy data for the preview screens.
- `supabase/migrations/`: database schema, reports, owner-only access rules, generic defaults, and the staging Settings demo switch.
- `src/lib/supabase.ts`: browser client used by the staging Settings screen.
- `src/lib/calc.ts`: all calculations (balances, sale, profit, delivery date, formatting).
- `src/components/`: shared UI and the interactive parts.
- Colors and fonts: `src/app/globals.css`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Netlify

The app is a static export (`out/` folder). `netlify.toml` is already set up.

**Option A, from GitHub (recommended):**
1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from Git → pick the repo.
3. Build settings fill in automatically from `netlify.toml` (command `npm run build`, publish `out`).
4. Deploy. `netlify.toml` selects staging Supabase for Deploy Previews and branch deploys, and the client project for production. Only staging Settings currently use that database connection. The other screens still use mock data.

**Option B, drag and drop:**
1. `npm run build`
2. Drag the `out` folder onto https://app.netlify.com/drop

## Database setup

All seven migration files in `supabase/migrations/` were applied through the Supabase CLI to both staging and production on 2026-10-12, with migration history recorded. Only staging was loaded with the invented `supabase/seed/dev-demo.sql` data; production has no demo customers or animals. Staging has `private.demo_access.enabled = true`, allowing anonymous read/update of its Settings row; production has the default `false`. Apply future schema changes through migrations so history stays in sync.

Anonymous visitors cannot access the farm tables other than staging Settings. The staging preview is shared, so anyone with its link can change those demo settings. Do not add a service-role or secret key to the browser app or Git repository.

For local staging Settings testing, set `NEXT_PUBLIC_SETTINGS_BACKEND=supabase` and the staging `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in an ignored `.env.local`. Without this flag, Settings use local storage.

For future work, see the [roadmap](docs/ROADMAP.md), [build guide](docs/BUILD-GUIDE.md), and [Step 1 foundation plan](docs/steps/step-1-foundation.md). The staging-only sample data is in `supabase/seed/dev-demo.sql`.

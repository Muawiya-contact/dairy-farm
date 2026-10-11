# Dairy Farm App (preview)

Farm settings use Supabase without a login. The dashboard, animals, milk, customer ledger, and expenses are still preview screens with dummy records; their save buttons do not persist data yet.
Language: Roman Urdu. Works on phone and laptop.

This is an open, shared testing preview: anyone with the link can view and change the same farm data. Use test data only until access is restricted for the client launch.

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

Only the Settings form saves to the database. The other forms remain demo interactions.

## Where things are

- `src/lib/mock-data.ts`: dummy data for the preview screens.
- `supabase/migrations/`: database schema, reports, preview access rules, and generic defaults.
- `src/lib/supabase.ts`: browser client using a publishable key.
- `src/lib/calc.ts`: all calculations (balances, sale, profit, delivery date, formatting).
- `src/components/`: shared UI and the interactive parts.
- Colors and fonts: `src/app/globals.css`.

## Run locally

```bash
npm install
cp .env.example .env.local
# Add your Supabase project URL and publishable key to .env.local.
npm run dev
```

Open http://localhost:3000

## Deploy to Netlify

The app is a static export (`out/` folder). `netlify.toml` is already set up.

**Option A, from GitHub (recommended):**
1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from Git → pick the repo.
3. Build settings fill in automatically from `netlify.toml` (command `npm run build`, publish `out`).
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Netlify's environment variables before deploying. These are embedded at build time, so redeploy after changing them.
5. Deploy.

**Option B, drag and drop:**
1. `npm run build`
2. Drag the `out` folder onto https://app.netlify.com/drop

## Database setup

Apply the six migration files in `supabase/migrations/` in filename order through the Supabase CLI or GitHub integration. Do not paste the schema into the production SQL Editor, because that bypasses migration history.

The app has no login in this preview. After all migrations are applied, anonymous visitors can access the farm tables using the browser publishable key. The owner UID and Supabase Authentication settings are not needed for this preview. Before using real client data, replace the public preview policy with restricted access. Do not add a service-role or secret key to the browser app or Git repository.

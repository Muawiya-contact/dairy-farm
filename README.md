# Dairy Farm App (preview)

The app opens without login. Settings are saved only in the current browser. The dashboard, animals, milk, customer ledger, and expenses are preview screens with dummy records; their save buttons do not persist data yet.
Language: Roman Urdu. Works on phone and laptop.

Anyone with the link can test the interface. Settings saved by one tester do not appear on another device.

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

Only the Settings form saves, and it saves to that browser's local storage. The other forms remain demo interactions.

## Where things are

- `src/lib/mock-data.ts`: dummy data for the preview screens.
- `supabase/migrations/`: database schema, reports, owner-only access rules, and generic defaults for later integration.
- `src/lib/supabase.ts`: browser client prepared for later authenticated use; the preview does not call it.
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
4. Deploy. Supabase environment variables are not needed for this no-login preview.

**Option B, drag and drop:**
1. `npm run build`
2. Drag the `out` folder onto https://app.netlify.com/drop

## Database setup

The preview does not use Supabase. The six migration files in `supabase/migrations/` prepare the database for later integration and preserve owner-only access. They can be applied in filename order through the Supabase CLI or GitHub integration when the authenticated app is ready. Do not paste the schema into the production SQL Editor, because that bypasses migration history.

Anonymous visitors cannot access the farm tables. Do not add a service-role or secret key to the browser app or Git repository.

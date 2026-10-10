# Dairy Farm App (preview)

Frontend-only preview of the dairy farm management app. All numbers are dummy data.
Language: Roman Urdu. Works on phone and laptop.

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

Forms work in the browser for the demo, but nothing is saved (no backend yet).

## Where things are

- `src/lib/mock-data.ts`: **all dummy data**. Replace this with Supabase queries later.
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
4. Deploy. Change the site name in Site settings to get a nicer link, e.g. `demo-dairy.netlify.app`.

**Option B, drag and drop:**
1. `npm run build`
2. Drag the `out` folder onto https://app.netlify.com/drop

## Change the farm name

Edit `FARM_NAME` and `OWNER_NAME` at the top of `src/lib/mock-data.ts`.

# Dairy Farm roadmap

This adapts the supplied `ROADMAP.md` to the current repository. The app is
currently a no-login preview with mostly local demo data. Its Supabase schema and
owner-only policies are in this PR; all seven migrations were applied to
staging and production on 2026-10-12. Staging has invented demo records and a
shared database-backed Settings screen; production has only schema and generic
defaults, and its website still uses local Settings.

| Step | Work | Depends on |
|---|---|---|
| 1. Foundation | Staging database, typed data access, login decision, settings | Schema PR |
| 2. Janwar | Animal records, health, sale/death, import | 1 |
| 3. Nasl kashi | Breeding register, due dates, calving | 2 |
| 4. Customers | Rates, customer types, opening balances | 1 |
| 5. Doodh | Daily production and deliveries | 2, 4 |
| 6. Wusooli / galla | Payments, bills, account transfers | 5 |
| 7. Kharcha | Expenses, salary, other income | 6 |
| 8. Reports / launch | Dashboard, month lock, backup, real data import | Earlier steps |

The supplied files only describe Step 1 in detail; later step documents,
client sheets, and the claimed larger test suite were not included. See
[Step 1](steps/step-1-foundation.md) and the [build guide](BUILD-GUIDE.md).

## Environments

Use **two Supabase projects** for this farm: a staging project with invented
records and a separate project reserved for real client data. Keep schema
changes in versioned migrations and apply the same migrations to both projects
at their appropriate release stages. The existing no-login Netlify preview
uses staging for Settings and local demo data for the other screens until their
database flows are built.

Staging is disposable; production is not. Do not copy real customer, animal,
or financial records into staging. Never put a secret/service-role key in the
browser or repository.

# Dairy Farm roadmap

This adapts the supplied `ROADMAP.md` to the current repository. The app is
currently a no-login preview with local demo data. Its Supabase schema and
owner-only policies are in the unmerged database PR; no live database migration
has been applied by this repository.

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
continues to use local demo data until authenticated database access is agreed
and implemented.

Staging is disposable; production is not. Do not copy real customer, animal,
or financial records into staging. Never put a secret/service-role key in the
browser or repository.

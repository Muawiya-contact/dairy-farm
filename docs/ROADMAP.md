# Dairy Farm roadmap

This adapts the supplied `ROADMAP.md` to the current repository. The app
now reads and saves farm records through Supabase. Thirty-two migrations are recorded
on staging and production as of 2026-10-15. Staging has invented demo records;
production has schema and generic defaults and requires the owner login.
The table below remains a plan for fuller workflows and launch readiness.

| Step | Work | Depends on |
|---|---|---|
| 1. Foundation | Staging database, typed data access, login decision, settings | Schema PR |
| 2. Janwar | Animal records, arrival/age, health, sale/death/other departure, import | 1 |
| 3. Nasl kashi | [Breeding register, due dates, individual calves](steps/step-3-breeding.md) | 2 |
| 4. Customers | Rates, customer types, opening balances | 1 |
| 5. Doodh | Daily production and deliveries | 2, 4 |
| 6. Wusooli / galla | Payments, bills, account transfers | 5 |
| 7. Kharcha | Expenses, salary, other income | 6 |
| 8. Reports / launch | Dashboard, month lock, backup, real data import | Earlier steps |

The supplied files only describe Step 1 in detail; later step documents,
client sheets, and the claimed larger test suite were not included. See
[Step 1](steps/step-1-foundation.md) and the [build guide](BUILD-GUIDE.md).
For the current status and acceptance criteria of all eight steps, including
the detailed Step 6 plan, see [implementation documentation](DOCUMENTATION.md).

## Environments

Use **two Supabase projects** for this farm: a staging project with invented
records and a separate project reserved for real client data. Keep schema
changes in versioned migrations and apply the same migrations to both projects
at their appropriate release stages. During the demo phase, both the Netlify
main site and Deploy Previews use staging for every screen. The separate
real-data project stays owner restricted until a planned live-data release.

Staging is disposable; production is not. Do not copy real customer, animal,
or financial records into staging. Never put a secret/service-role key in the
browser or repository.

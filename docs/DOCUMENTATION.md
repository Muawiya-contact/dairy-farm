# Dairy Farm: implementation and acceptance plan

Checked against `main` after [PR #8](https://github.com/Muawiya-contact/dairy-farm/pull/8) merged on 2026-10-14. The [roadmap](ROADMAP.md) defines eight steps. Update this document as each feature changes; the status below is based on code, not a claim that every workflow has passed an end-to-end audit.

## Architecture and environments

Next.js builds a static site on Netlify. React Query and the Supabase browser client read and write PostgreSQL records. The browser gets only a publishable key. Tables, constraints, triggers, RLS, and database report functions are the source of truth for financial records. Stored money uses PostgreSQL `numeric(12,2)` and business dates use `date` and the database `farm_today()` rule; browser timezone and floating-point sums must not redefine balances.

Netlify main and Deploy Previews currently connect to **staging**, which contains invented demo data and allows shared access. A separate **production** Supabase project has the same 20 migrations, owner-only access, and no demo seed. Production is reserved for real client data. Switching the live site to production requires a planned release; there is no browser database toggle.

## Definition of done for every step

1. **Design:** State owner actions, saved results, and acceptance examples. Inspect existing code and schema; check current official API behavior. Record assumptions and decisions before coding.
2. **Data safety:** Put schema and money rules in versioned migrations, preserve deployed migration history, enforce invariants with constraints/RLS, and test staging anonymous versus production owner access. Keep secret/service-role keys out of the browser and repository. Never seed production with demo records.
3. **Validation and errors:** Handle blank versus zero, negative values, precision, dates, missing/inactive relations, repeat submits, stale reads, locked months, and network failures as applicable. Show a useful Roman Urdu message and safe retry. Report success only after the database confirms it.
4. **Tests:** Add focused unit tests for parsing and calculations, database tests for constraints/triggers/RLS/totals, and regression tests for fixed bugs. Cover normal, empty, invalid, boundary, and failed-save cases. A helper test alone does not prove the hosted feature works.
5. **Before the PR:** Run `npm run check` (Vitest, ESLint, TypeScript, static build). Apply migrations to staging through Supabase CLI and verify migration history. Check the Netlify preview at phone and laptop widths for loading, empty, error, and success states. Check device-specific sharing on a real phone. State exactly what passed and what remains unverified.
6. **Release:** Keep changes focused with atomic commits. Apply the same migrations to production at the planned release stage, confirm owner-only access and no demo records, and have the owner review the preview. Merging or closing any PR requires explicit confirmation for that PR.

## All eight steps

| Step | Implemented so far | Next acceptance milestone |
|---|---|---|
| **1. Foundation** | Supabase projects, typed access, settings, staging demo, owner-restricted production, migrations, CI, and deployment. | Verify environment mapping, RLS, types, and migration history at each release. |
| **2. Janwar** | Animal records, details, health, and sale/death data. | Finish Excel import and full life-cycle operations; test duplicate and inactive animals and historical records. |
| **3. Nasl kashi** | Breeding entries and due dates on animal details. | Complete the breeding register and calving workflow; test dates and status transitions. |
| **4. Customers** | Types, opening balances, dated rates, profiles, and monthly views. | Verify rate history and opening-date calculations across all customer types. |
| **5. Doodh** | Morning/evening production, deliveries, historical shift editing, and Naqd auto payment. | Test full daily operations, corrections, totals, and locked months. |
| **6. Wusooli / galla** | Payments, monthly bills, company bills, PDFs/share; database ledger functions. **Galla UI, corrections, and reconciliation remain.** | Complete the Step 6 scope and evidence below. |
| **7. Kharcha** | Basic expenses, categories, accounts, and profit screens. The schema already distinguishes farm costs from personal costs. | Add a clear **Ghar ka kharcha** option and separate home-expense view, then complete staff/salary and other income; test account and profit effects. |
| **8. Reports / launch** | Dashboard, monthly reports, CSV/Excel/PDF exports, and JSON data snapshot. | Finish month-lock controls, backup/restore plan, real-data import, monitoring, and production launch checks. |

Earlier unfinished work stays tracked while Step 6 progresses.

## Step 6: Wusooli and galla

### Delivered in PR #8

Customer profile editing, dated rates, monthly reports/registers, payment entry with amount/date/method/account validation, company bills, farm contact number, statement PDFs, receipt PDFs, and Share buttons. A supported phone opens its native share sheet so the owner can choose WhatsApp. On unsupported devices the PDF downloads and, with a valid customer number, a WhatsApp chat can open with prefilled text; the owner attaches the PDF manually. A web page cannot guarantee the WhatsApp recipient or automatic attachment.

The schema already has `payments`, `transfers`, `accounts`, `month_locks`, and `company_bills`. `customer_month_report(date)` calculates monthly charges, payments, discounts, and balance. `account_entries(uuid)` unions payments, other income, transfers in/out, and expenses. `account_month_summary(date)` calculates opening, in, out, and closing per account. A milk-delivery trigger manages Naqd auto payments. These database primitives do **not** mean the full galla workflow is available in the UI.

Main code: [`FarmCustomers.tsx`](../src/components/FarmCustomers.tsx), [`farm-data.ts`](../src/lib/farm-data.ts), [`customer-forms.ts`](../src/lib/customer-forms.ts), [`customer-documents.ts`](../src/lib/customer-documents.ts), and [`supabase/migrations/`](../supabase/migrations/). PR #8 reported 50 passing tests, lint, typecheck, build, and a Netlify preview. Real-phone sharing and the remaining Step 6 flows are not verified by that result.

### Required next work

1. **Galla screen:** Account and month selectors, opening/in/out/closing cards, dated ledger, empty state, and negative-balance warning. Use the existing report functions. Filter or paginate large ledgers server-side; avoid loading every report row to find one customer or account.
2. **Transfers:** One row with source, destination, date, positive amount, and optional note. Reject same-account transfers, inactive accounts, excessive decimal precision, future dates, and locked months. Its two ledger effects must preserve combined farm money. Handle an uncertain retry without duplicate transfer.
3. **Cash count/reconciliation:** Define policy, then migrate a `cash_counts` table for account, date, counted cash, expected ledger amount, difference, reason, and audit metadata. Display counted versus expected. A count must never silently change ledger balance. Decide same-day multiple-count and correction rules.
4. **Payment correction and discounts:** Controlled correction/reversal with confirmation and audit history; never directly edit/delete a Naqd auto payment. Explicit discount reduces customer balance without adding cash. Protect locked months in the database and UI. Decide reversal versus immutable audit-record policy before implementation.
5. **Customer cases:** Show overpayment as an advance. Handle free customers, Naqd readonly payments/receipts, company slips, mid-month rate changes, opening balances, empty months, and missing phone. Never issue a payment receipt for a discount.
6. **Documents:** Use saved database values plus farm name/contact and customer/date details. Test PDF failure, canceled share, unsupported share, and desktop fallback. Owner chooses and confirms the target app.

### Technical decisions

- Reuse `account_entries` and `account_month_summary` RPCs; a transfer is one database row. Use one constrained PostgreSQL function/transaction if an operation must write multiple tables atomically.
- Query a selected customer report in the database instead of fetching all reports and then `.find()` in the browser; PostgREST row limits can otherwise hide a customer as data grows.
- Keep persisted money and totals in PostgreSQL `numeric`; validate two decimal places on both sides. Cash counts reconcile physical cash to the ledger and are not income or expense.
- New tables/functions need owner-only production RLS and explicit function grants. Shared staging access is intentional for disposable demo data, not a production policy.
- Clarify backdated payment and correction rules before changing the schema; existing month-lock triggers must remain authoritative.

### Acceptance evidence before the Step 6 implementation PR

| Area | Automated checks | Staging preview check |
|---|---|---|
| Ledger | Opening + inflows − outflows = closing; inactive account with history visible; negative balance retained. | Compare one account/month against saved rows; inspect an empty month. |
| Transfers | Source differs from destination, amount positive/two decimals, locked date, RLS, one outflow/one inflow. | Transfer between two demo accounts; both balances change and combined total stays equal. |
| Cash count | Difference, reason, same-day policy, locked date, RLS. | Count exact and mismatched demo cash; ledger remains unchanged. |
| Payments | Required account/method, advance, discount, Naqd protection, correction audit, locked month. | Save, correct, inspect receipts/balances, and retry an interrupted save. |
| Documents | Saved totals, missing phone, canceled/unsupported share, generation error. | Download/print on desktop; verify attachment and recipient on a real phone before sending. |
| Access | Anonymous staging and owner-only production for every new table/RPC. | Check signed-out and owner sessions; keep real data out of staging. |

**Optional later:** monthly galla CSV/Excel/PDF reconciliation, batch reminders, image receipt, low-balance alerts, and accountant approval. Treat each as separate scope with tests.

## Step 7 request: Ghar ka kharcha

The client wants a quick, clearly named home-expense choice on the Kharcha screen, with its own visible section and totals. Implement this in the dedicated Step 7 feature PR, separate from Step 6. Reuse the existing `expenses` and `expense_categories` model: a `Ghar ka kharcha` category has `is_farm_cost = false`. A home expense reduces the selected cash/bank account balance and appears in the galla ledger, but belongs in `personal_expenses` and must **not** reduce farm profit. Do not treat a free milk delivery to a home as a cash expense.

The Step 7 PR should add the category through a migration for existing staging and production projects, provide an obvious home-expense action in the create form, and show separate farm and home totals/history. Validate date, positive amount, two decimal places, active account, duplicate submit, failed save, and locked month. Test the category's effect on account balance, personal expense report, and farm profit with database tests; verify the phone and laptop UI in the staging preview. Keep the name and labels in Roman Urdu.

## Official references

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), and [JavaScript RPC](https://supabase.com/docs/reference/javascript/rpc)
- [Supabase CLI migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)

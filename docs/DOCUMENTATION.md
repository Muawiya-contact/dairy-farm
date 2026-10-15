# Dairy Farm: implementation and acceptance plan

Updated for the Step 2 animal lifecycle work on 2026-10-15. The [roadmap](ROADMAP.md) defines eight steps. Update this document as each feature changes; the status below is based on code, not a claim that every workflow has passed an end-to-end audit.

## Architecture and environments

Next.js builds a static site on Netlify. React Query and the Supabase browser client read and write PostgreSQL records. The browser gets only a publishable key. Tables, constraints, triggers, RLS, and database report functions are the source of truth for financial records. Stored money uses PostgreSQL `numeric(12,2)` and business dates use `date` and the database `farm_today()` rule; browser timezone and floating-point sums must not redefine balances.

Netlify main and Deploy Previews currently connect to **staging**, which contains invented demo data and allows shared access. A separate **production** Supabase project has the same 29 migrations, owner-only access, and no demo seed. Production is reserved for real client data. Switching the live site to production requires a planned release; there is no browser database toggle.

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
| **2. Janwar** | Animal records, health, and sale/death data; arrival, optional age evidence, dated history, and other departure are in the animal lifecycle update. | Finish Excel import and a correction audit trail; verify historical records and inactive animals. |
| **3. Nasl kashi** | Breeding entries and due dates on animal details. | Complete the breeding register and calving workflow; test dates and status transitions. |
| **4. Customers** | Types, opening balances, dated rates, profiles, and monthly views. | Verify rate history and opening-date calculations across all customer types. |
| **5. Doodh** | Morning/evening production, deliveries, historical shift editing, and Naqd auto payment. | Test full daily operations, corrections, totals, and locked months. |
| **6. Wusooli / galla** | Payments, monthly bills, company bills, PDFs/share, Galla UI, manual transfers, cash counts, and audited corrections are implemented in PR #10. | Verify the live preview on phone and laptop, especially device sharing and real owner workflows. |
| **7. Kharcha** | Farm/home expenses, categories, accounts, profit screens, and staff salary periods with partial payments. | Verify the salary preview; complete other income and audited expense corrections in later focused work. |
| **8. Reports / launch** | Dashboard, monthly reports, CSV/Excel/PDF exports, and JSON data snapshot. | Finish month-lock controls, backup/restore plan, real-data import, monitoring, and production launch checks. |

Earlier unfinished work stays tracked in the roadmap and future step PRs.

## Step 2: Animal lifecycle

The animal lifecycle update records a real arrival date, optional exact birth date or clearly labeled estimated age at arrival, and sale/death/other departure. Current age derives from dates; age at exit is fixed. The detail page presents health, breeding, calving, milk, and exit history, and exports carry the underlying dates and estimate. Database migration `20261015000029` enforces the date and activity boundaries while leaving unknown legacy arrival dates unset. Owner actions, edge cases, and checks are in [Step 2 animal lifecycle](steps/step-2-animal-lifecycle.md). Spreadsheet import and an audit log of profile edits remain later work.

## Step 6: Wusooli and galla

### Delivered in PR #8

Customer profile editing, dated rates, monthly reports/registers, payment entry with amount/date/method/account validation, company bills, farm contact number, statement PDFs, receipt PDFs, and Share buttons. On supported phones, a Share button opens the native share sheet. On unsupported devices the PDF downloads; the owner can open a WhatsApp chat and attach it manually.

The later receipt-sharing update passes the PDF `File` to the native Web Share sheet, where the owner chooses WhatsApp and the recipient. If PDF generation outlasts transient user activation, a second tap reuses the prepared bytes. A second permission failure downloads the PDF. The separate **WhatsApp chat + PDF** action opens a new chat tab with prefilled text and downloads the PDF; on desktop the owner attaches it manually. The app cannot pick a share target or manipulate WhatsApp Web's file input across origins, and it never sends on the owner's behalf.

The schema has `payments`, `transfers`, `accounts`, `cash_counts`, `payment_audit`, `month_locks`, and `company_bills`. `customer_month_report(date)` calculates monthly charges, payments, discounts, and balance. `account_entries(uuid)` unions payments, other income, transfers in/out, and expenses. `account_month_summary(date)` calculates opening, in, out, and closing per account; an account opened midmonth contributes its starting balance on its actual opening date. A milk-delivery trigger manages Naqd auto payments. The owner-facing Galla screen and operating rules are documented in [Step 6 Galla](steps/step-6-galla.md).

Main code: [`FarmCustomers.tsx`](../src/components/FarmCustomers.tsx), [`farm-data.ts`](../src/lib/farm-data.ts), [`customer-forms.ts`](../src/lib/customer-forms.ts), [`customer-documents.ts`](../src/lib/customer-documents.ts), and [`supabase/migrations/`](../supabase/migrations/). PR #8 reported 50 passing tests, lint, typecheck, build, and a Netlify preview. Real-phone sharing and the remaining Step 6 flows are not verified by that result.

### Step 6 scope and acceptance checks

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

### Step 6 acceptance checks

| Area | Automated checks | Staging preview check |
|---|---|---|
| Ledger | Opening + inflows − outflows = closing; inactive account with history visible; negative balance retained. | Compare one account/month against saved rows; inspect an empty month. |
| Transfers | Source differs from destination, amount positive/two decimals, locked date, RLS, one outflow/one inflow. | Transfer between two demo accounts; both balances change and combined total stays equal. |
| Cash count | Difference, reason, same-day policy, locked date, RLS. | Count exact and mismatched demo cash; ledger remains unchanged. |
| Payments | Required account/method, advance, discount, Naqd protection, correction audit, locked month. | Save, correct, inspect receipts/balances, and retry an interrupted save. |
| Documents | Saved totals, missing phone, canceled/unsupported share, generation error. | Download/print on desktop; verify attachment and recipient on a real phone before sending. |
| Access | Anonymous staging and owner-only production for every new table/RPC. | Check signed-out and owner sessions; keep real data out of staging. |

**Optional later:** monthly galla CSV/Excel/PDF reconciliation, batch reminders, image receipt, low-balance alerts, and accountant approval. Treat each as separate scope with tests.

## Step 7: Ghar ka kharcha

The client requested a quick home-expense choice on the Kharcha screen. The dedicated feature uses the existing `expenses` and `expense_categories` model: `Ghar ka kharcha` has `is_farm_cost = false`. A home expense reduces the selected account balance and appears in the Galla ledger; it belongs in `personal_expenses` and does **not** reduce farm profit. A free milk delivery to a home is not a cash expense.

Migrations `20261014000024` and `20261014000025` are recorded on both projects; production received no demo seed. The form now separates farm, home, and other personal costs and validates date, positive amount, two decimal places, account opening date, active account, and active category. A retry retains the same expense ID. Database triggers reject future dates and inactive relations, while the existing month lock remains authoritative. See [Step 7 Kharcha](steps/step-7-kharcha.md) for operation and test details.

## Step 7: Mulazim aur tankhwah

The dedicated `/salary/` screen manages staff, a separately agreed amount for each worker and month, multiple partial payments, the amount paid and remaining, and payment history. Payments debit one chosen active account through the existing `expenses` ledger and reduce farm profit on the payment date. The agreed amount does not itself create a cash transaction. Migrations `20261014000026` through `20261014000028` enforce monthly uniqueness, salary links, overpayment prevention, month locks, RLS, an immutable agreed amount after the first payment, and immutable paid entries until an audited correction workflow exists. Existing salary expenses were linked to their payment month as fully paid; no unpaid debt was inferred. See [Step 7 salary](steps/step-7-salary.md) for detailed behavior and checks. Advances, paid-entry corrections, and other-income entry remain separate work.

## Official references

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), and [JavaScript RPC](https://supabase.com/docs/reference/javascript/rpc)
- [Supabase CLI migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934), [MDN same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)

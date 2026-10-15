# Step 4: Customers and dated prices

## Owner workflow

1. In **Khata**, add a regular, contractor, company, Naqd, or Muft customer. Set the opening date to the first day represented by this account. A regular, contractor, or Naqd customer needs a positive litre rate. A company is billed from its slip; Muft milk has no charge. For Muft, choose whether it is for the owner's home, staff, charity, calves, or another reason.
2. Enter a previous balance only when it already exists on the opening date. Positive means the customer owes the farm; negative means the customer has paid in advance. Naqd and Muft start at zero. Do not re-enter previous deliveries or payments already included in this balance.
3. Use **Doodh ka rate** to schedule a new price for a chosen effective date, up to one year ahead. Saved deliveries keep their amount snapshot. A rate cannot be changed for a period containing saved deliveries. Use the next unused date for a new price; corrections to an already billed delivery need their own audited workflow.
4. Search customers by name or phone and filter Active/Band. Closing a customer removes them from new milk entry but preserves their history and outstanding balance in Khata. The total due includes closed customers with a debt.
5. Record a payment, discount, or company slip on or after the customer's opening date. The customer report and bill use the saved ledger; the app does not compute a separate browser-only balance.

## Technical design

- Migration `20261015000033_customer_history_guards.sql` protects the opening boundary for new deliveries, payments, discounts, and company slips. It rejects a future opening date and stops changing an opening date after a rate or ledger entry exists. Existing rows are left untouched; this is a forward write guard.
- The same migration keeps dated rates for chargeable customer types only, within one year ahead and on/after opening. A previously used interval cannot be repriced or split by a backdated rate. An unchanged same-date retry still succeeds. New deliveries and rate changes lock the same customer row, so their order is settled in PostgreSQL; each delivery keeps its saved rate and amount snapshot.
- Migration `20261015000034_customer_free_reason.sql` adds a nine-argument `create_customer` function with a validated free reason. The earlier eight-argument function remains available to deployed clients during rollout. Both run with caller permissions; the new overload is granted to authenticated users and to anonymous users only when staging demo access is enabled.
- Migration `20261015000035_customer_identity_guard.sql` prevents direct customer-type changes and opening-balance rewrites after deliveries, payments, or company slips exist. An opening-balance typo may still be corrected before financial activity; the owner UI does not expose this edit.
- Review migration `20261015000036_customer_activity_lock.sql` makes payment and company-slip writes take the same customer-row lock as milk deliveries and rate edits. A concurrent ledger insert and opening-history edit now have a consistent order; foreign-key key-share locks alone do not serialize ordinary customer updates. Discount and payment-correction forms also enforce the opening date before submitting.
- `customer-forms.ts` validates dates, money, litres, free reasons, and customer types before a write. Database rules remain authoritative for direct API calls and concurrent users. Friendly Roman Urdu messages explain rejected entries.
- The demo seed's rate starts on the customer's opening date. It remains fictional and is used only for fresh staging/test setups. The migration does not rewrite existing historical rate rows in either live project.

The database rules follow [PostgreSQL's trigger and function model](https://www.postgresql.org/docs/current/sql-createtrigger.html) and [row-lock conflict rules](https://www.postgresql.org/docs/current/explicit-locking.html), plus [Supabase's guidance on caller permissions for database functions](https://supabase.com/docs/guides/database/functions). The customer and rate tables continue to use [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security); a browser key does not grant production owner access.

## Acceptance and limits

- Database tests exercise unchanged retries, a used rate, a backdated split, a future scheduled price, the saved delivery snapshot, pre-opening entries for all three ledger paths, immutable customer identity, opening-balance correction boundaries, free-reason validation and rollback, and the existing Galla month-lock behavior. Form tests exercise negative values, invalid reasons, future dates, and opening boundaries.
- Run Vitest, ESLint, TypeScript, and the static build before the PR. Apply migrations to staging and production with recorded history; production must stay owner restricted and unseeded. Check the hosted preview at phone and laptop widths, including form errors and inactive customers.
- An already saved delivery cannot be repriced through this customer rate form. Correcting a historical bill, changing a customer type after activity, and deleting a rate history row require a separate audited correction design. No automatic bank or WhatsApp connection is added here.

The project-wide [definition of done](../DOCUMENTATION.md#definition-of-done-for-every-step) applies to this step.

## Validation on 2026-10-15

- `npm run check` passed: 107 tests across 25 files, TypeScript, and the static build. ESLint reported one existing font warning in `src/app/layout.tsx` and no errors. Two Vitest workers are used because parallel PGlite setups timed out at the default worker count on this machine.
- Supabase CLI recorded migrations 33–35 on staging and production. The production push contained schema migrations only, with no demo seed; the CLI was linked back to staging afterward.
- The hosted PR #18 preview was checked at laptop and phone widths. Two clearly labeled fictional staging customers were created. Muft reason creation/edit and Band search/filter worked; the closed customer remained visible in Khata. A future rate of Rs 190/L was saved for the next day while the current display stayed Rs 180/L. GitHub and Netlify checks passed. The local in-app browser was blocked by its URL policy, so no local visual result is claimed. A physical-phone check remains unverified.
- Review follow-up: 107 tests passed again, including pre-opening correction and payment/bill activity guards. Lint had the same font warning; TypeScript and the static build passed. Migration 36 was recorded on both staging and production without a seed and the CLI was relinked to staging. A simultaneous two-session database race was not directly reproduced; the fix follows PostgreSQL's documented row-lock conflict rules.

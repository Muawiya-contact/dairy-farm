# Ledger, milk and report expansion

This checklist tracks the client-requested follow-up. Every financial output
uses saved database records; it does not retype totals in the browser or copy
the client workbook's historical rows into staging.

## Delivery checklist

- [ ] Add a dedicated **Reports aur PDF** page with day, month, year and custom
  date-range controls.
- [ ] Add a complete Khata ledger report: opening balance, milk charges,
  payments, discounts, closing balance and chronological entries.
- [ ] Keep direct customer bill/receipt actions in Khata and add a date-range
  ledger PDF/download/share action.
- [ ] Add a one-off local customer flow inside Doodh, not a separate navigation
  page. It supports an occasional named cash sale or a free/gift distribution
  with a custom rate where money is charged.
- [ ] Add a clear **Khairat / Muft doodh** shortcut. Its litres remain in milk
  distribution but its charge, customer balance, income and cash receipt stay
  zero.
- [ ] Add an audited milk correction with a required reason. It must never let
  deliveries exceed the corrected production or silently overwrite another
  session's change.
- [ ] Add a close-customer confirmation which states any remaining balance and
  preserves all history.
- [ ] Add daily expense PDF/download/share, including farm and home costs as
  separate totals.
- [ ] Add animal-wise insemination history/count report with PDF/download/share.
- [ ] Add a monthly, yearly and custom-period management report inspired by the
  supplied workbook: milk, billed/paid amounts, receivables, income, farm and
  home costs, and profit/loss.
- [ ] Keep all generated documents branded with the farm identity, Coding Moves
  attribution, official contact details and a QR code for the Coding Moves site.
- [ ] Add component/database tests for each write path and PDF data boundary.
- [ ] Verify the staging Deploy Preview on desktop and phone-sized layouts,
  including download/share fallbacks.

## Workbook mapping

The older workbook has daily milk/customer rows, a daily expense register,
animal milk tables, insemination sheets and a monthly hisaab. The new app does
not duplicate its spreadsheet formula layout. Instead, its reports calculate
the same business meanings from normalized rows: deliveries and company bills
for milk income, payments and discounts for Khata, expenses by category scope,
other income, and animal/breeding records.

## Accounting rules

- A local cash buyer is represented separately from the farm's regular delivery
  customers, but its charged litres create the same auditable delivery and cash
  movement.
- Free/charity milk has a visible distribution row and zero amount. It never
  becomes revenue, receivable or automatic cash.
- A milk correction changes saved quantities only through the checked database
  write. Reducing production below saved deliveries is rejected; the user first
  corrects those deliveries.
- Closing a customer only stops new milk assignment. It never removes bills,
  payments, balances or previous PDFs.

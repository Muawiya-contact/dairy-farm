# Step 8: Final Farm Performance Report

## Owner workflow

Reports → Final Report presents a read-only farm summary for this month, the
previous month, year to date, or a custom range. It reuses the existing report
route. The date range is validated against the Pakistan farm date before any
queries run, and the selected range is included in PDF, Excel, print, and
user-initiated PDF sharing. Sharing never sends a file automatically; devices
without file sharing get a download instead.

Farm Analytics also compares daily buckets for ranges under 90 days and monthly
buckets for longer ranges. It ranks billed customers, animal-level milk records,
and saved expense categories. Average animal production divides recorded
animal litres by recorded animal-days; it does not allocate total-only shifts.
Cost and profit per litre remain unavailable until feed costs can be traced to
milk production without estimates.

The report brings together milk production and destinations, stock variance,
Khata balances, local cash sales, expense categories, Financial Report P&L,
account cash flow, and owner deposits/withdrawals. Links open the related
detail reports. Empty, loading, invalid-date, and retryable error states are
shown without writing farm data.

## Sources and calculations

| Report data | Authoritative source | Rule |
|---|---|---|
| Milk volumes, sales, and closing stock | `milk_report_distribution_summary`, `milk_report_distribution_daily`, and `milk_report_distribution_shifts` | Existing milk report rules; free, farm-use, and waste remain separate from sales. The displayed litre variance checks opening + production against destinations + closing to hundredths of a litre. |
| Customer Khata | `final_report_khata`, wrapping `khata_period_summary` | PostgreSQL returns each customer and one explicit grand-total row. Total payable is opening + opening added + charges − discounts + refunds. Closing balance also subtracts payments. Positive closings are receivables; negative closings are customer credits. |
| Closing farm cash and bank | `final_report_cash_position`, wrapping `financial_report_cashflow` | PostgreSQL totals cash and bank account closings only. Personal/person accounts are excluded. No cash/bank total is shown when there is no supported account. |
| Expense category totals | `final_report_expense_categories` | PostgreSQL groups each saved expense once by category and Farm versus Home/personal classification. Linked salary and inventory costs remain their saved expense rows and are not re-counted from their related records. |
| Profit and loss | `report_period_summary` through the existing Financial Report loader | The Final Report shows its saved billed income, other income, farm expenses, and profit values directly; it does not recompute profit in the browser. Home/personal expenses remain separately labeled. |
| Owner movements | Existing owner transfer summary | Deposits and withdrawals are presented separately and never treated as operating income or expense. |

All new PostgreSQL report functions are stable, read-only, `security invoker`,
date-validated, and granted to authenticated users. Anonymous execution is
enabled only for the shared staging demo when its existing demo-access setting
is enabled. Production keeps the owner-only access policy. Migration
`20261121000014_final_report_summaries.sql` adds report functions only; it adds
no tables and writes no farm records.

## Validation

Database tests cover payable versus payment and closing balance, carry-forward,
advances, cash/bank versus personal accounts, expense category reconciliation
to the P&L, empty totals, invalid dates, and authenticated/demo permissions.
Unit and UI tests cover date boundaries, milk quantity reconciliation, loading
and errors, export actions, sharing fallback, and invalid future ranges. E2E
tests run on 360px mobile and desktop. Staging preview QA must confirm layout,
selected-period updates, exports, and print behavior before the PR is marked
ready to merge.

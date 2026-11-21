# Reports coverage

The nine menu groups organize existing report screens; they do not create a
second source of report data. Each screen reads the saved records or database
report functions listed below. If the farm does not record a value, the report
leaves it unknown or unavailable instead of inventing a figure.

| Group | Existing report and supported records | Limits in the current data model |
|---|---|---|
| Customer Reports | `/reports/customer/` and `/reports/khata/`: saved deliveries, bills, payments, discounts, balances, and customer statements. | No automated bank or payment-provider feed. Collections only include saved payments. Customers with zero balance and no recorded activity are omitted; an inactivity-by-lookback report is not available yet. |
| Milk Reports | `/reports/milk/` and `/reports/animal/milk/`: production, opening/closing stock, Khata/cash/free/farm-use/waste destinations, collections, customer details, and animal shifts. | Historical categories are shown only where records exist; no past destination is inferred. |
| Purchase Reports | `/reports/inventory/`: saved inventory purchases by item, date, quantity, supplier text, reference, amount, and account. | Supplier balances, purchase returns, and purchase orders have no separate ledger. |
| Sales Reports | `/reports/milk/` and `/reports/customer/`: milk sales, cash/Khata distinction, customer totals, and actual collections. | Other dairy-product sales and returns are not recorded by this app. |
| Accounts Reports | `/reports/accounts/`, `/reports/khata/`, and `/reports/kharcha/`: saved account movements, owner transfers, customer balances, and expenses. | No supplier subledger or double-entry trial balance. |
| Financial Reports | `/reports/financial/` and `/reports/kharcha/`: database-calculated billed income, other income, farm/personal expenses, receivables, and profit/loss. | No balance sheet or asset/liability valuation; the app does not maintain a complete double-entry accounting model. |
| Animal Reports | `/reports/animal/` and `/reports/animal/milk/`: herd, animal status, health, breeding, calving, and recorded milk. | Health history records owner-entered information; it is not veterinary diagnosis. |
| Feed & Inventory Reports | `/reports/inventory/` shows stock, purchases, general/staff usage, adjustments, wastage, and low stock. The `/janwar/` animal list opens per-animal feed history. | Feed cost remains unavailable without traceable stock valuation. Inventory use is not silently assigned to an animal. |
| Farm Analytics | `/reports/final/` and `/reports/financial/`: selected-period milk, balances, cash position, expenses, and saved profit/loss. | Analytics use available saved records only; unsupported or missing inputs are not replaced with demo estimates. |

## Delivery phases

- **Phase 1 — Customer, Milk, Sales, and Purchase:** implemented for the records
  the app currently captures. Sales are milk-only; purchases are inventory
  purchases rather than a supplier-payables system.
- **Phase 2 — Accounts and Financial:** implemented for account, customer-ledger,
  expense, income, and profit/loss records. Trial balance, balance sheet, and
  supplier payable reports need additional accounting data.
- **Phase 3 — Animal, Feed, and Inventory:** implemented for animal reports,
  inventory movements, and per-animal feed history. Feed-cost valuation is not
  claimed until an auditable inventory-cost source exists.
- **Phase 4 — Farm Analytics:** the Final Report combines available saved data
  for a selected period. It does not produce unsupported forecasts or figures.

The menu links related categories to the same authoritative screen where their
records overlap. For example, Milk and Sales both point to Milk Report; this is
one report page and one set of saved totals, not duplicate sales data.

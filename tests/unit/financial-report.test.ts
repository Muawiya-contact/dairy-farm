import { describe, expect, it } from "vitest";
import {
  accountCashflowReconciles, financialReportExportSections, flattenFinancialExport,
  groupFinancialExpenses, groupOtherIncome, receivableTotals, salaryPayableTotal,
  type FinancialReportData,
} from "@/lib/financial-report";

const report: FinancialReportData = {
  period: {
    farmName: "Test Farm",
    summary: {
      produced: 20, delivered: 18, sold_litres: 18, free_litres: 0,
      milk_income: 1000, cash_collected: 400, other_income: 200,
      farm_expenses: 300, home_expenses: 75, profit: 900,
    },
    customers: [{
      customer_id: "customer-1", name: "Ali", kind: "regular", sort_order: 1,
      litres: 18, charged: 1000, paid: 400, discount: 0, refund: 0, period_balance_change: 600,
    }],
    expenses: [{
      expense_date: "2026-11-20", category: "Feed", is_farm_cost: true,
      account: "Farm galla", amount: 300, note: "Wanda",
    }, {
      expense_date: "2026-11-20", category: "Home", is_farm_cost: false,
      account: "Farm galla", amount: 75, note: null,
    }],
  },
  customers: [{
    customer_id: "customer-1", name: "Ali", kind: "regular", active: true, sort_order: 1,
    litres: 18, charges: 1000, payments: 400, discounts: 0, refunds: 0,
    opening_balance: 0, opening_added: 0, closing_balance: 600,
  }, {
    customer_id: "customer-2", name: "Bilal", kind: "regular", active: false, sort_order: 2,
    litres: 0, charges: 0, payments: 0, discounts: 0, refunds: 0,
    opening_balance: 0, opening_added: 0, closing_balance: -100,
  }],
  accounts: [{
    account_id: "cash-1", account_name: "Farm galla", account_kind: "cash",
    opening_balance: 500, money_received: 600, money_paid: 100,
    transfers_in: 50, transfers_out: 50, closing_balance: 1000,
    opening_date: "2026-11-01", opening_amount: 0,
  }],
  salaryPayables: [{
    staff_id: "staff-1", staff_name: "Ismail", salary_month: "2026-11-01",
    agreed_amount: 1000, paid_amount: 250, outstanding_amount: 750,
  }],
  otherIncome: [{
    income_id: "income-1", income_date: "2026-11-20", kind: "animal_sale",
    amount: 200, note: "Sale", animal_tag: "101",
  }],
  trends: [{
    bucket_start: "2026-11-20", milk_income: 1000, other_income: 200,
    customer_collections: 400, farm_expenses: 300, home_expenses: 75,
    total_income: 1200, net_profit: 900, cash_received: 600, cash_paid: 375,
  }],
};

describe("financial report calculations and exports", () => {
  it("separates positive receivables from customer credit balances", () => {
    expect(receivableTotals(report.customers)).toEqual({ due: 600, customerCredits: 100 });
  });

  it("groups expense detail exactly once and preserves farm/home classification", () => {
    expect(groupFinancialExpenses(report.period.expenses)).toEqual([
      { category: "Feed", classification: "Farm", amount: 300, entries: 1 },
      { category: "Home", classification: "Home / personal", amount: 75, entries: 1 },
    ]);
  });

  it("groups captured income sources without dropping animal sales", () => {
    expect(groupOtherIncome([
      report.otherIncome[0],
      { ...report.otherIncome[0], income_id: "income-2", kind: "manure", amount: 60, animal_tag: null },
    ])).toEqual([
      { kind: "animal_sale", label: "Animal sale", amount: 200 },
      { kind: "manure", label: "Manure", amount: 60 },
    ]);
  });

  it("checks the account conservation formula including internal transfers", () => {
    expect(accountCashflowReconciles(report.accounts[0])).toBe(true);
    expect(accountCashflowReconciles({ ...report.accounts[0], closing_balance: 999 })).toBe(false);
  });

  it("exports report metadata, P&L formulas, and filtered supporting detail", () => {
    expect(salaryPayableTotal(report.salaryPayables)).toBe(750);
    const sections = financialReportExportSections(report, [], "2026-11-01", "2026-11-20", "2026-11-20");
    expect(sections[0].rows[0]).toEqual({
      farm_name: "Test Farm", report_period: "2026-11-01 to 2026-11-20", generated_at: "2026-11-20",
    });
    expect(sections.find((section) => section.title === "Profit and loss")?.rows).toContainEqual({
      line: "Net farm profit / loss", amount_rs: 900,
      treatment: "Matches report_period_summary; home/personal expenses excluded",
    });
    expect(sections.find((section) => section.title === "Selected account ledger")?.rows).toEqual([]);
    const flat = flattenFinancialExport(sections);
    expect(flat.columns).toContain("section");
    expect(flat.rows.some((row) => row.section === "Customer receivables" && "closing_balance" in row && row.closing_balance === 600)).toBe(true);
  });
});

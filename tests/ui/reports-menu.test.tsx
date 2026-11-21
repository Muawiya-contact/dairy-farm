import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithQuery } from "./utils";
import ReportsPage from "@/app/reports/page";

it("shows the nine dairy report groups with links to existing reports", () => {
  renderWithQuery(<ReportsPage />);
  const menu = screen.getByRole("navigation", { name: "Report categories" });
  const groups = Array.from(menu.querySelectorAll("section"));
  expect(groups).toHaveLength(9);
  expect(groups.map((group) => group.querySelector("h2")?.textContent)).toEqual([
    "Customer Reports",
    "Milk Reports",
    "Purchase Reports",
    "Sales Reports",
    "Accounts Reports",
    "Financial Reports",
    "Animal Reports",
    "Feed & Inventory Reports",
    "Farm Analytics",
  ]);
  const links = Array.from(menu.querySelectorAll("a"));
  expect(links).toHaveLength(18);
  expect(links.map((link) => [link.textContent?.trim(), link.getAttribute("href")?.replace(/\/$/, "")])).toEqual([
    ["Customer statements and sales", "/reports/customer"],
    ["Khata balances and ledger", "/reports/khata"],
    ["Production, destinations and collections", "/reports/milk"],
    ["Animal-wise milk", "/reports/animal/milk"],
    ["Purchases by item and supplier", "/reports/inventory"],
    ["Milk cash and Khata sales", "/reports/milk"],
    ["Sales by customer", "/reports/customer"],
    ["Accounts and owner movements", "/reports/accounts"],
    ["Customer ledgers", "/reports/khata"],
    ["Expense day book", "/reports/kharcha"],
    ["Income, expenses and profit/loss", "/reports/financial"],
    ["Expense categories", "/reports/kharcha"],
    ["Animal inventory, health and breeding", "/reports/animal"],
    ["Animal-wise milk", "/reports/animal/milk"],
    ["Stock, purchases and usage", "/reports/inventory"],
    ["Per-animal feed history", "/janwar"],
    ["Monthly Farm Performance", "/reports/final"],
    ["Financial trends", "/reports/financial"],
  ]);
  expect(screen.getByText(/Supplier balance, purchase returns aur purchase orders alag se track nahi hote/)).toBeInTheDocument();
  expect(screen.getByText(/Dahi, makkhan ya ghee ki sales alag se record nahi hoti/)).toBeInTheDocument();
  expect(screen.queryByText("Report ki tareekh")).not.toBeInTheDocument();
});

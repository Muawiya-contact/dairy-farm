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
    ["Customer Report", "/reports/customer"],
    ["Khata Report", "/reports/khata"],
    ["Milk Report", "/reports/milk"],
    ["Animal-wise Milk Report", "/reports/animal/milk"],
    ["Stock ki Report", "/reports/inventory"],
    ["Milk Report", "/reports/milk"],
    ["Customer Report", "/reports/customer"],
    ["Accounts Report", "/reports/accounts"],
    ["Khata Report", "/reports/khata"],
    ["Kharcha Report", "/reports/kharcha"],
    ["Maali Report", "/reports/financial"],
    ["Kharcha Report", "/reports/kharcha"],
    ["Animal Report", "/reports/animal"],
    ["Animal-wise Milk Report", "/reports/animal/milk"],
    ["Stock ki Report", "/reports/inventory"],
    ["Per-animal feed history", "/janwar"],
    ["Final Report", "/reports/final"],
    ["Maali Report", "/reports/financial"],
  ]);
  expect(screen.getByText(/Supplier balance, purchase returns aur purchase orders alag se track nahi hote/)).toBeInTheDocument();
  expect(screen.getByText(/Dahi, makkhan ya ghee ki sales alag se record nahi hoti/)).toBeInTheDocument();
  expect(screen.queryByText("Report ki tareekh")).not.toBeInTheDocument();
});

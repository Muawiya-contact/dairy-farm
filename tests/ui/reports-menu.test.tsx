import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithQuery } from "./utils";
import ReportsPage from "@/app/reports/page";

it("shows exactly the seven report categories on the Reports landing page", () => {
  renderWithQuery(<ReportsPage />);
  const menu = screen.getByRole("navigation", { name: "Report categories" });
  const links = Array.from(menu.querySelectorAll("a"));
  expect(links).toHaveLength(7);
  expect(links.map((link) => link.textContent?.trim())).toEqual([
    "Customer Report",
    "Milk Report",
    "Khata Report",
    "Kharcha Report",
    "Inventory Report",
    "Animal Report",
    "Financial Report",
  ]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/reports/customer",
    "/reports/milk",
    "/reports/khata",
    "/reports/kharcha",
    "/reports/inventory",
    "/reports/animal",
    "/reports/financial",
  ]);
  expect(screen.queryByText("Report ki tareekh")).not.toBeInTheDocument();
});

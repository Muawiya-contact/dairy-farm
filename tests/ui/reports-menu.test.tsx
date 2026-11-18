import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithQuery } from "./utils";
import ReportsPage from "@/app/reports/page";

it("shows only the nine report categories on the Reports landing page", () => {
  renderWithQuery(<ReportsPage />);
  const menu = screen.getByRole("navigation", { name: "Report categories" });
  expect(screen.getAllByRole("link")).toHaveLength(9);
  expect(["Customer Report", "Milk Report", "Khata Report", "Kharcha Report", "Inventory Report", "Animal Report", "Financial Report", "Accounts Report", "Final Report"])
    .toEqual(Array.from(menu.querySelectorAll("a")).map((link) => link.textContent?.trim()));
  expect(screen.queryByText("Report ki tareekh")).not.toBeInTheDocument();
});

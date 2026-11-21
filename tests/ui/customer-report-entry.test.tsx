import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import CustomerReportEntry from "@/components/CustomerReportEntry";

vi.mock("@/components/FarmCustomers", () => ({ default: () => <h1>Customer statement detail</h1> }));
vi.mock("@/components/KhataSummaryReport", () => ({ default: ({ title }: { title: string }) => <h1>{title} summary page</h1> }));

it("opens the customer summary from the menu without replacing customer statement links", () => {
  window.history.replaceState({}, "", "/reports/customer/");
  const { unmount } = renderWithQuery(<CustomerReportEntry />);
  expect(screen.getByRole("heading", { name: "Customer Report summary page" })).toBeInTheDocument();
  expect(screen.queryByText("Jald aa raha hai")).not.toBeInTheDocument();
  unmount();

  window.history.replaceState({}, "", "/reports/customer/?id=customer-1&from=2026-10-01&to=2026-10-16");
  renderWithQuery(<CustomerReportEntry />);
  expect(screen.getByRole("heading", { name: "Customer statement detail" })).toBeInTheDocument();
});

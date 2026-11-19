import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import CustomerReportEntry from "@/components/CustomerReportEntry";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/components/FarmCustomers", () => ({ default: () => <h1>Customer statement detail</h1> }));

it("opens a clear report placeholder from the menu without replacing customer statement links", () => {
  window.history.replaceState({}, "", "/reports/customer/");
  const { unmount } = renderWithQuery(<CustomerReportEntry />);
  expect(screen.getByRole("heading", { name: "Customer Report" })).toBeInTheDocument();
  expect(screen.getByText("Jald aa raha hai")).toBeInTheDocument();
  unmount();

  window.history.replaceState({}, "", "/reports/customer/?id=customer-1&from=2026-10-01&to=2026-10-16");
  renderWithQuery(<CustomerReportEntry />);
  expect(screen.getByRole("heading", { name: "Customer statement detail" })).toBeInTheDocument();
});

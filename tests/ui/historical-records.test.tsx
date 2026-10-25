import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { renderWithQuery } from "./utils";
import HistoricalRecordsPage from "@/app/history/page";

const loadPage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/historical-records", () => ({ historicalPage: loadPage, HISTORICAL_PAGE_SIZE: 50 }));

it("shows source location and uncertainty without adding history to current balances", async () => {
  loadPage.mockResolvedValue({ count: 1, rows: [{
    source_key: "a", kind: "milk_day", record_date: "2026-06-03", source_label: "Demo buyer", canonical_label: "Current demo buyer",
    litres: 7.5, charged_rs: 1125, paid_rs: null, remaining_rs: null,
    farm_debit_rs: null, home_debit_rs: null, daily_credit_rs: null,
    details: {}, flags: ["remaining_uses_reverse_sign"],
    source_workbook: "demo.xlsx", source_sheet: "Daily Milk", source_cell: "B7",
  }] });
  renderWithQuery(<HistoricalRecordsPage />);
  expect(await screen.findByText("Demo buyer")).toBeInTheDocument();
  expect(screen.getByText(/demo.xlsx · Daily Milk!B7/)).toBeInTheDocument();
  expect(screen.getByText("Ab ka naam: Current demo buyer")).toBeInTheDocument();
  expect(screen.getByText(/Baqaya ka nishan ulta/)).toBeInTheDocument();
  expect(screen.getByText(/aaj ke Khata aur Galla mein shamil nahi/)).toBeInTheDocument();
});

it("resets pagination when the owner changes archive filters", async () => {
  loadPage.mockResolvedValue({ count: 51, rows: [] });
  renderWithQuery(<HistoricalRecordsPage />);
  await screen.findByText("Safha 1 / 2");
  await userEvent.click(screen.getByRole("button", { name: "Agla" }));
  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("all", "", 1, ""));
  await userEvent.selectOptions(screen.getByLabelText("Qism"), "expense_day");
  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("expense_day", "", 0, ""));
  await userEvent.type(screen.getByRole("searchbox"), "Munawar");
  await userEvent.click(screen.getByRole("button", { name: "Dhoondein" }));
  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("expense_day", "", 0, "Munawar"));
});

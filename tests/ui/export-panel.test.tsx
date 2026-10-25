import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ExportPanel } from "@/components/ExportPanel";

const exportMocks = vi.hoisted(() => ({
  downloadFile: vi.fn(), exportRows: vi.fn(), fetchDataset: vi.fn(),
  fetchReport: vi.fn(), fetchBreedingRegister: vi.fn(), buildFarmBackup: vi.fn(),
}));

vi.mock("@/lib/export-data", () => ({
  BREEDING_COLUMNS: ["tag"],
  DATASETS: [{ table: "animals", label: "Janwar", columns: ["tag"] }],
  REPORTS: [{ name: "milk_month_summary", label: "Doodh ka khulasa", columns: ["produced"] }],
  ...exportMocks,
}));
vi.mock("@/lib/backup", () => ({ buildFarmBackup: exportMocks.buildFarmBackup }));
vi.mock("@/lib/dates", () => ({ todayPK: () => "2026-10-25" }));

it("keeps the complete JSON backup separate from the selected report/table format", async () => {
  exportMocks.buildFarmBackup.mockResolvedValue({ format: "dairy-farm-data-v1", tables: {} });
  exportMocks.fetchDataset.mockResolvedValue([{ tag: "101" }]);
  exportMocks.fetchReport.mockResolvedValue([{ produced: 7.5 }]);
  exportMocks.fetchBreedingRegister.mockResolvedValue([{ tag: "101" }]);
  exportMocks.exportRows.mockResolvedValue(undefined);
  render(<ExportPanel />);
  const backup = screen.getByRole("region", { name: "Mukammal farm backup (JSON)" });
  const formats = screen.getByRole("region", { name: "Reports aur tables export karein" });
  expect(within(backup).getByRole("button", { name: "Mukammal backup · JSON download" })).toBeInTheDocument();
  expect(within(backup).queryByLabelText("Report aur table ki file qism")).not.toBeInTheDocument();

  await userEvent.selectOptions(within(formats).getByLabelText("Report aur table ki file qism"), "pdf");
  await userEvent.click(within(formats).getByRole("button", { name: "Janwar · PDF" }));
  await waitFor(() => expect(exportMocks.exportRows).toHaveBeenCalledWith("dairy-animals", "Janwar", ["tag"], [{ tag: "101" }], "pdf"));
  await userEvent.selectOptions(within(formats).getByLabelText("Report aur table ki file qism"), "xlsx");
  await userEvent.click(within(formats).getByRole("button", { name: "Doodh ka khulasa · XLSX" }));
  await waitFor(() => expect(exportMocks.exportRows).toHaveBeenCalledWith(
    "dairy-milk_month_summary-2026-10", "Doodh ka khulasa", ["produced"], [{ produced: 7.5 }], "xlsx",
  ));
  await userEvent.selectOptions(within(formats).getByLabelText("Report aur table ki file qism"), "csv");
  await userEvent.click(within(formats).getByRole("button", { name: "Nasl kashi register · CSV" }));
  await waitFor(() => expect(exportMocks.exportRows).toHaveBeenCalledWith(
    "dairy-nasl-kashi-register", "Nasl kashi register", ["tag"], [{ tag: "101" }], "csv",
  ));
  await userEvent.click(within(backup).getByRole("button", { name: "Mukammal backup · JSON download" }));
  await waitFor(() => expect(exportMocks.downloadFile).toHaveBeenCalledWith(
    "dairy-backup-2026-10-25.json", expect.stringContaining('"dairy-farm-data-v1"'), "application/json;charset=utf-8",
  ));
});

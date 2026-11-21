import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";

const mocks = vi.hoisted(() => ({
  loadAnimalReport: vi.fn(), getSettings: vi.fn(),
  buildPdfReport: vi.fn(), downloadBlob: vi.fn(), sharePdfFile: vi.fn(),
}));

vi.mock("@/lib/animal-reports", async (original) => ({ ...(await original<typeof import("@/lib/animal-reports")>()), loadAnimalReport: mocks.loadAnimalReport }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: mocks.getSettings }));
vi.mock("@/lib/export-data", async (original) => ({
  ...(await original<typeof import("@/lib/export-data")>()), buildPdfReport: mocks.buildPdfReport, downloadBlob: mocks.downloadBlob,
}));
vi.mock("@/lib/pdf-share", async (original) => ({ ...(await original<typeof import("@/lib/pdf-share")>()), sharePdfFile: mocks.sharePdfFile }));
vi.mock("@/lib/dates", async (original) => ({ ...(await original<typeof import("@/lib/dates")>()), todayPK: () => "2026-10-16" }));

import AnimalReportPage from "@/app/reports/animal/page";

const animal = { id: "animal-1", tag: "101", name: "Gauri", species: "cow", life_status: "active" };
const reportData = { summary: [{ label: "Janwar", value: "1" }], sections: [{
  title: "Janwaron ki fehrist", columns: ["tag", "name"], rows: [{ tag: "101", name: "Gauri" }],
}] };

beforeEach(() => {
  const query = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [animal], error: null });
  supabaseMocks.getSupabase.mockReturnValue({ from: vi.fn(() => query) });
  mocks.loadAnimalReport.mockResolvedValue(reportData);
  mocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
  mocks.buildPdfReport.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.downloadBlob.mockReset();
  mocks.sharePdfFile.mockResolvedValue("shared");
});

it("shows all ten animal report types inside the existing report destination", async () => {
  renderWithQuery(<AnimalReportPage />);
  await screen.findByRole("heading", { name: "Janwaron ki fehrist" });
  expect(screen.getByRole("navigation", { name: "Animal report types" }).querySelectorAll("button")).toHaveLength(10);
  expect(screen.getByRole("button", { name: /Gaye ki report/ })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("link", { name: "Wapas" })).toHaveAttribute("href", "/reports");
});

it("prints every report row even when the on-screen table is paginated", async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({ tag: String(index + 1), name: `Animal ${index + 1}` }));
  mocks.loadAnimalReport.mockResolvedValueOnce({
    summary: [{ label: "Janwar", value: "51" }],
    sections: [{ title: "Janwaron ki fehrist", columns: ["tag", "name"], rows }],
  });

  renderWithQuery(<AnimalReportPage />);
  await screen.findByRole("heading", { name: "Janwaron ki fehrist" });

  const screenTable = screen.getByRole("table", { name: "Janwaron ki fehrist (screen)" });
  const printTable = screen.getByRole("table", { name: "Janwaron ki fehrist (print)" });
  expect(within(screenTable).getAllByRole("row")).toHaveLength(51);
  expect(within(printTable).getAllByRole("row")).toHaveLength(52);

  await userEvent.setup().click(screen.getByRole("button", { name: "Agla" }));
  expect(within(screenTable).getAllByRole("row")).toHaveLength(2);
  expect(within(printTable).getAllByRole("row")).toHaveLength(52);
});

it("applies animal and date filters to the selected milk report", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalReportPage />);
  await screen.findByRole("heading", { name: "Janwaron ki fehrist" });
  await user.click(screen.getByRole("button", { name: /Rozana aur maahana doodh/ }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Animal report janwar" }), "animal-1");
  await user.type(screen.getByRole("searchbox", { name: "Animal report search" }), "101");
  await waitFor(() => expect(mocks.loadAnimalReport).toHaveBeenLastCalledWith("milk", {
    from: "2026-10-01", to: "2026-10-16", animalId: "animal-1", species: "all", search: "101",
  }, [animal]));
});

it("puts the chosen report, filters, and generation date into the PDF and supports native sharing", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalReportPage />);
  await screen.findByRole("heading", { name: "Janwaron ki fehrist" });
  await user.click(screen.getByRole("button", { name: "PDF download" }));
  await waitFor(() => expect(mocks.buildPdfReport).toHaveBeenCalledOnce());
  expect(mocks.buildPdfReport).toHaveBeenCalledWith("Tamam janwar", expect.arrayContaining([
    expect.objectContaining({ title: "Report ki tafseel", rows: expect.arrayContaining([
      expect.objectContaining({ detail: "PDF ki tareekh", value: "2026-10-16" }),
      expect.objectContaining({ detail: "Janwar", value: "Tamam janwar" }),
    ]) }),
    expect.objectContaining({ title: "Report ka khulasa", rows: [{ detail: "Janwar", value: "1" }] }),
    expect.objectContaining({ title: "Janwaron ki fehrist", rows: [{ tag: "101", name: "Gauri" }] }),
  ]), "Saim Dairy Farm");
  expect(mocks.downloadBlob).toHaveBeenCalledWith("animal-report-inventory.pdf", expect.any(Blob));

  await user.click(screen.getByRole("button", { name: "PDF share karein" }));
  await waitFor(() => expect(mocks.sharePdfFile).toHaveBeenCalledOnce());
  expect(await screen.findByRole("status")).toHaveTextContent("Share sheet khul gayi");
});

it("allows an empty report PDF and explains report query failures", async () => {
  const user = userEvent.setup();
  mocks.loadAnimalReport.mockResolvedValueOnce({ summary: [{ label: "Janwar", value: "0" }], sections: [{ title: "Empty", columns: ["tag"], rows: [] }] });
  renderWithQuery(<AnimalReportPage />);
  expect(await screen.findByText(/database mein koi record nahi mila/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PDF download" })).toBeEnabled();
  mocks.loadAnimalReport.mockRejectedValueOnce(new Error("failed to fetch"));
  await user.click(screen.getByRole("button", { name: /Gaabhan janwar/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Animal Report nahi khuli");
});

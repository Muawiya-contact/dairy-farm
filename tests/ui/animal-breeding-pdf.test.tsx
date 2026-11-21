import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { fixtures, renderWithQuery } from "./utils";
import { AnimalBreeding } from "@/components/AnimalBreeding";

const documentMocks = vi.hoisted(() => ({ buildPdf: vi.fn(), downloadBlob: vi.fn(), getSettings: vi.fn() }));
vi.mock("@/lib/export-data", async (original) => ({ ...(await original<typeof import("@/lib/export-data")>()), buildPdf: documentMocks.buildPdf, downloadBlob: documentMocks.downloadBlob }));
vi.mock("@/lib/settings", async (original) => ({ ...(await original<typeof import("@/lib/settings")>()), getSettings: documentMocks.getSettings }));

beforeEach(() => {
  documentMocks.buildPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  documentMocks.downloadBlob.mockReset();
  documentMocks.getSettings.mockResolvedValue({ farm_name: "Saim Dairy Farm" });
});

it("exports the selected animal's complete insemination history", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalBreeding animal={fixtures.cow as never} animals={[fixtures.cow] as never} today={fixtures.today} busy={false} run={async (task) => task()}
    records={[{ id: "ai-1", animal_id: fixtures.cow.id, service_date: "2026-01-02", semen_type: "normal", semen_name: "Irishman", semen_batch: null, technician: "Ali", status: "pregnant", ultrasound_date: null, ultrasound_result: null, ultrasound_due: "2026-02-01", ultrasound_due_override: "2026-02-05", checkup_date: null, checkup_result: null, checkup_due: "2026-03-01", checkup_due_override: null, dry_off_date: null, dry_off_due: "2026-08-01", dry_off_due_override: "2026-07-28", calving_due: "2026-10-01", calving_due_override: null, abortion_date: null, notes: null, updated_at: "2026-01-02T00:00:00Z" } as never]}
    calvings={[]} offspring={[]} />);
  expect(screen.getByRole("button", { name: "Is janwar ki PDF" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "PDF share" })).toHaveClass("min-h-11");
  await user.click(screen.getByRole("button", { name: "Is janwar ki PDF" }));
  await waitFor(() => expect(documentMocks.buildPdf).toHaveBeenCalledWith(
    `Nasl kashi record — ${fixtures.cow.tag}`,
    expect.arrayContaining(["ultrasound_due_type", "checkup_due_type", "dry_off_due_type", "calving_due_type"]),
    [expect.objectContaining({ service_date: "2026-01-02", semen_name: "Irishman", status: "Gaabhan",
      ultrasound_due: "2026-02-05", ultrasound_due_type: "Khud darj", checkup_due: "2026-03-01", checkup_due_type: "Hisab se",
      dry_off_due: "2026-07-28", dry_off_due_type: "Khud darj", calving_due: "2026-10-01", calving_due_type: "Hisab se" })],
    "Saim Dairy Farm",
  ));
  expect(documentMocks.downloadBlob).toHaveBeenCalledOnce();
});

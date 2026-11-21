import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { farmMocks, renderWithQuery, supabaseMocks } from "./utils";
import { AnimalHealthHistory } from "@/components/AnimalHealthHistory";
import type { HealthEvent } from "@/lib/farm-data";

const event = (overrides: Partial<HealthEvent> = {}): HealthEvent => ({
  id: "health-1", animal_id: "animal-1", event_date: "2026-10-20", kind: "treatment", title: "Vet visit",
  medicine: null, vet: null, notes: null, cost: 300, next_due_date: null, expense_id: "expense-1", created_at: "2026-10-20T10:00:00Z",
  symptoms: "Limping", diagnosis: "Hoof check by vet", severity: "moderate", current_condition: "Recovering",
  medicine_type: "Topical", dosage: "Vet recorded dose", route: "Topical", treatment_start_date: "2026-10-20", treatment_end_date: null,
  ...overrides,
});

beforeEach(() => {
  supabaseMocks.getSupabase.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  } as never);
});

it("filters vaccine/deworming records and shows the full veterinary history and recorded cost total", async () => {
  const user = userEvent.setup();
  const run = vi.fn(async (task: () => Promise<void>) => task());
  renderWithQuery(<AnimalHealthHistory animalId="animal-1" events={[
    event(), event({ id: "vaccine-1", kind: "vaccine", title: "FMD vaccine", event_date: "2026-10-19", cost: 50 }),
    event({ id: "deworm-1", kind: "deworming", title: "Deworming", event_date: "2026-10-18", cost: 0 }),
  ]} attachments={[]} categories={[]} accounts={[]} today="2026-10-20" active={false} busy={false} run={run} />);

  expect(screen.getByText("Recorded medical total: Rs 350")).toBeInTheDocument();
  expect(await screen.findAllByRole("button", { name: "Private file upload" })).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Private file upload" })[0]).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Vaccines" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Deworming" })).toHaveClass("min-h-11");
  expect(screen.getAllByText(/Symptoms: Limping/)).toHaveLength(3);
  expect(screen.getAllByText(/Vet ki tashkhees: Hoof check by vet/)).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Vaccines" }));
  expect(screen.getByText("FMD vaccine")).toBeInTheDocument();
  expect(screen.queryByText("Vet visit")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Deworming" }));
  expect(screen.getByText("Deworming", { selector: "strong" })).toBeInTheDocument();
});

it("keeps private attachment open, refresh, and download controls at least 44px tall", async () => {
  const user = userEvent.setup();
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.test/private-file" }, error: null });
  supabaseMocks.getSupabase.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as never);
  const attachment = {
    id: "attachment-1", health_event_id: "health-1", storage_path: "health-1/11111111-1111-4111-8111-111111111111.pdf",
    file_name: "vet-report.pdf", content_type: "application/pdf", size_bytes: 1024, created_at: "2026-10-20T10:00:00Z",
  };
  renderWithQuery(<AnimalHealthHistory animalId="animal-1" events={[event()]} attachments={[attachment]} categories={[]} accounts={[]} today="2026-10-20" active={false} busy={false} run={async (task) => task()} />);

  const openButton = await screen.findByRole("button", { name: "Private file dekhein" });
  expect(openButton).toHaveClass("min-h-11");
  await user.click(openButton);
  expect(await screen.findByRole("link", { name: "File download karein" })).toHaveClass("min-h-11");
  const refreshButton = screen.getByRole("button", { name: "Naya private link" });
  expect(refreshButton).toHaveClass("min-h-11");
  expect(createSignedUrl).toHaveBeenCalledOnce();
  await user.click(refreshButton);
  await waitFor(() => expect(createSignedUrl).toHaveBeenCalledTimes(2));
});

it("records optional vet details and one linked health expense through the atomic RPC", async () => {
  const user = userEvent.setup();
  farmMocks.recordHealthEvent.mockReset().mockResolvedValue(undefined);
  const run = vi.fn(async (task: () => Promise<void>) => task());
  const categories = [{ id: "vet-category", name: "Dawai / vet", is_farm_cost: true, is_salary: false, active: true, sort_order: 1 }];
  const accounts = [{ id: "cash", name: "Farm galla", kind: "cash", is_farm_cash: true, active: true, opening_date: "2026-01-01" }];
  renderWithQuery(<AnimalHealthHistory animalId="animal-1" events={[]} attachments={[]} categories={categories} accounts={accounts} today="2026-10-20" active busy={false} run={run} />);

  await user.type(screen.getByLabelText("Entry ka naam"), "FMD vaccine");
  await user.selectOptions(screen.getByLabelText("Health record type"), "vaccine");
  await user.type(screen.getByLabelText("Symptoms / nishaniyan"), "No symptoms recorded");
  await user.type(screen.getByLabelText("Vet ki likhi tashkhees"), "No diagnosis recorded");
  await user.selectOptions(screen.getByLabelText("Shiddat (optional)"), "mild");
  await user.type(screen.getByLabelText("Medicine / vaccine product"), "FMD vaccine batch 4");
  await user.type(screen.getByLabelText("Dose"), "Recorded from vet note");
  await user.type(screen.getByLabelText("Veterinarian"), "Dr. Farm");
  await user.type(screen.getByLabelText("Kharcha Rs"), "250.50");
  await user.selectOptions(screen.getByLabelText("Kharcha category"), "vet-category");
  await user.selectOptions(screen.getByLabelText("Kharcha account"), "cash");
  await user.type(screen.getByLabelText("Notes"), "Owner-entered notes");
  fireEvent.submit(screen.getByRole("button", { name: "Health entry save" }).closest("form")!);

  await waitFor(() => expect(farmMocks.recordHealthEvent).toHaveBeenCalledWith({
    animalId: "animal-1", date: "2026-10-20", kind: "vaccine", title: "FMD vaccine", cost: 250.5,
    nextDueDate: null, categoryId: "vet-category", accountId: "cash", medicine: "FMD vaccine batch 4", veterinarian: "Dr. Farm",
    notes: "Owner-entered notes", symptoms: "No symptoms recorded", diagnosis: "No diagnosis recorded", severity: "mild",
    currentCondition: null, medicineType: null, dosage: "Recorded from vet note", route: null,
    treatmentStartDate: null, treatmentEndDate: null,
  }));
  expect(run).toHaveBeenCalledTimes(1);
});

it("lets an editor save the shared health event while hiding private clinical fields", async () => {
  const user = userEvent.setup();
  const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
  supabaseMocks.getSupabase.mockReturnValue({ rpc } as never);
  farmMocks.recordHealthEvent.mockReset().mockResolvedValue(undefined);
  const run = vi.fn(async (task: () => Promise<void>) => task());
  renderWithQuery(<AnimalHealthHistory animalId="animal-1" events={[event()]} attachments={[]} categories={[]} accounts={[]} today="2026-10-20" active busy={false} run={run} />);

  expect(await screen.findByText(/sirf farm malik darj kar sakta hai/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Symptoms / nishaniyan")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Private file upload" })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Entry ka naam"), "FMD vaccination");
  await user.type(screen.getByLabelText("Medicine / vaccine product"), "Vaccine batch 4");
  await user.type(screen.getByLabelText("Veterinarian"), "Dr. Farm");
  await user.type(screen.getByLabelText("Notes"), "Routine vaccination");
  fireEvent.submit(screen.getByRole("button", { name: "Health entry save" }).closest("form")!);

  await waitFor(() => expect(farmMocks.recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
    animalId: "animal-1", title: "FMD vaccination", medicine: "Vaccine batch 4", veterinarian: "Dr. Farm",
    notes: "Routine vaccination", symptoms: null, diagnosis: null, severity: null, currentCondition: null,
    medicineType: null, dosage: null, route: null, treatmentStartDate: null, treatmentEndDate: null,
  })));
  expect(run).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith("can_manage_veterinary_details");
});

it("explains invalid treatment ranges and follow-up dates before saving", async () => {
  const user = userEvent.setup();
  farmMocks.recordHealthEvent.mockReset();
  const run = vi.fn(async (task: () => Promise<void>) => task());
  renderWithQuery(<AnimalHealthHistory animalId="animal-1" events={[]} attachments={[]} categories={[]} accounts={[]} today="2026-10-20" active busy={false} run={run} />);
  const form = screen.getByRole("button", { name: "Health entry save" }).closest("form")!;
  await user.type(screen.getByLabelText("Entry ka naam"), "Treatment check");
  fireEvent.change(screen.getByLabelText("Treatment start"), { target: { value: "2026-10-21" } });
  fireEvent.change(screen.getByLabelText("Treatment end"), { target: { value: "2026-10-20" } });
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent("Treatment end tareekh");
  expect(farmMocks.recordHealthEvent).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Treatment end"), { target: { value: "2026-10-22" } });
  fireEvent.change(screen.getByLabelText("Agli due tareekh"), { target: { value: "2026-10-19" } });
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent("Agli due tareekh");
  expect(farmMocks.recordHealthEvent).not.toHaveBeenCalled();
});

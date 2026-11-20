import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";
import { AnimalCareTasks } from "@/components/AnimalCareTasks";
import type { AnimalCareTask } from "@/lib/farm-data";

it("adds a reminder and completes it with an actual date and note", async () => {
  const user = userEvent.setup();
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "task-1" }, error: null });
  const select = vi.fn(() => ({ maybeSingle }));
  const is = vi.fn(() => ({ select }));
  const eqUpdated = vi.fn(() => ({ is }));
  const eqId = vi.fn(() => ({ eq: eqUpdated }));
  const update = vi.fn(() => ({ eq: eqId }));
  supabaseMocks.getSupabase.mockReturnValue({ from: vi.fn(() => ({ insert, update })) });
  const run = vi.fn(async (task: () => Promise<void>) => task());
  const task: AnimalCareTask = {
    id: "task-1", animal_id: "animal-1", category: "vaccination", title: "FMD vaccine", due_date: "2026-10-18",
    notes: null, completed_date: null, completion_notes: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  };

  const { rerender } = renderWithQuery(<AnimalCareTasks animalId="animal-1" tasks={[]} today="2026-10-20" active busy={false} run={run} />);
  await user.selectOptions(screen.getByLabelText("Qism"), "vaccination");
  await user.type(screen.getByLabelText("Task ka naam"), "FMD vaccine");
  fireEvent.change(screen.getByLabelText("Due tareekh"), { target: { value: "2026-10-18" } });
  expect(screen.getByLabelText("Task ka naam")).toHaveValue("FMD vaccine");
  expect(screen.getByLabelText("Due tareekh")).toHaveValue("2026-10-18");
  fireEvent.submit(screen.getByRole("button", { name: "Yaad-dihani save" }).closest("form")!);
  await waitFor(() => expect(insert).toHaveBeenCalledWith({ animal_id: "animal-1", category: "vaccination", title: "FMD vaccine", due_date: "2026-10-18", notes: null }));

  rerender(<AnimalCareTasks animalId="animal-1" tasks={[task]} today="2026-10-20" active busy={false} run={run} />);
  await user.click(screen.getByRole("button", { name: "Mukammal karein" }));
  await user.type(screen.getByLabelText("Mukammal hone ka note"), "Vaccine given");
  await user.click(screen.getByRole("button", { name: "Task mukammal save karein" }));
  expect(update).toHaveBeenCalledWith({ completed_date: "2026-10-20", completion_notes: "Vaccine given" });
  expect(eqId).toHaveBeenCalledWith("id", "task-1");
  expect(eqUpdated).toHaveBeenCalledWith("updated_at", task.updated_at);
  expect(is).toHaveBeenCalledWith("completed_date", null);
  expect(run).toHaveBeenCalledTimes(2);
});

it("shows completed care reminders as history without offering to complete again", () => {
  const task: AnimalCareTask = {
    id: "task-2", animal_id: "animal-1", category: "deworming", title: "Deworming", due_date: "2026-10-10",
    notes: null, completed_date: "2026-10-10", completion_notes: "Done by vet", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-10T00:00:00Z",
  };
  renderWithQuery(<AnimalCareTasks animalId="animal-1" tasks={[task]} today="2026-10-20" active busy={false} run={vi.fn()} />);
  expect(screen.getByLabelText("Mukammal yaad-dihani tasks")).toHaveTextContent("Deworming");
  expect(screen.getByLabelText("Mukammal yaad-dihani tasks")).toHaveTextContent("Done by vet");
  expect(screen.queryByRole("button", { name: "Mukammal karein" })).not.toBeInTheDocument();
});

it("lets the owner close an existing reminder after the animal leaves the farm", () => {
  const task: AnimalCareTask = {
    id: "task-3", animal_id: "animal-1", category: "checkup", title: "Past vet follow-up", due_date: "2026-10-10",
    notes: null, completed_date: null, completion_notes: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  };
  renderWithQuery(<AnimalCareTasks animalId="animal-1" tasks={[task]} today="2026-10-20" active={false} busy={false} run={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Mukammal karein" })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Task ka naam" })).not.toBeInTheDocument();
});

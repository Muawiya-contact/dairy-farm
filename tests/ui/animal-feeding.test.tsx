import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { Animal, AnimalFeedRecord } from "@/lib/farm-data";
import { renderWithQuery, fixtures } from "./utils";

const mocks = vi.hoisted(() => ({
  loadAnimalFeedOptions: vi.fn(),
  saveAnimalFeedRecord: vi.fn(),
  correctAnimalFeedRecord: vi.fn(),
}));
vi.mock("@/lib/animal-feeding", async (original) => ({
  ...(await original<typeof import("@/lib/animal-feeding")>()),
  loadAnimalFeedOptions: mocks.loadAnimalFeedOptions,
  saveAnimalFeedRecord: mocks.saveAnimalFeedRecord,
  correctAnimalFeedRecord: mocks.correctAnimalFeedRecord,
}));

import { AnimalFeeding } from "@/components/AnimalFeeding";

const feedRecord: AnimalFeedRecord = {
  id: "feed-1", animal_id: "animal-1", inventory_item_id: "feed-item", feed_date: fixtures.today,
  quantity: 2, unit: "kg", stock_quantity: 2, stock_unit: "kg", note: "Morning feed", stock_movement_id: "movement-1",
  request_id: "request-1", request_payload: {}, supersedes_id: null, created_at: `${fixtures.today}T10:00:00Z`,
  item_name: "Wanda", category_name: "Animal feed & fodder", item_base_unit: "kg", superseded_by: null,
};

const run = async (task: () => Promise<void>) => task();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAnimalFeedOptions.mockResolvedValue([{
    id: "feed-item", name: "Wanda", category_name: "Animal feed & fodder", base_unit: "kg", current_stock: 5,
  }]);
  mocks.saveAnimalFeedRecord.mockResolvedValue("feed-new");
  mocks.correctAnimalFeedRecord.mockResolvedValue("feed-corrected");
});

it("records a dated animal feed issue from inventory and states that no extra expense is created", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalFeeding animal={fixtures.cow as Animal} records={[]} today={fixtures.today} busy={false} run={run} />);
  await screen.findByText("Maujooda stock: 5 kg");
  (screen.getByLabelText("Miqdar") as HTMLInputElement).value = "2.5";
  await user.type(screen.getByLabelText("Note (optional)"), "Morning feed");
  fireEvent.submit(screen.getByRole("button", { name: "Feed save karein" }).closest("form")!);
  await waitFor(() => expect(mocks.saveAnimalFeedRecord).toHaveBeenCalledWith(expect.objectContaining({
    animalId: fixtures.cow.id, itemId: "feed-item", quantity: 2.5, unit: "kg", date: fixtures.today, note: "Morning feed",
  })));
  expect(await screen.findByRole("status")).toHaveTextContent("inventory stock aik martaba update hua");
  expect(screen.getByText(/doosra Kharcha nahi banta/)).toBeInTheDocument();
});

it("offers a correction while retaining the original entry for audit", async () => {
  const user = userEvent.setup();
  renderWithQuery(<AnimalFeeding animal={fixtures.cow as Animal} records={[feedRecord]} today={fixtures.today} busy={false} run={run} />);
  await screen.findByRole("button", { name: "Durust karein" });
  await user.click(screen.getByRole("button", { name: "Durust karein" }));
  expect(screen.getByText(/Tareekhi feed din barqarar rahega/)).toBeInTheDocument();
  const quantity = screen.getByLabelText("Corrected miqdar") as HTMLInputElement;
  quantity.value = "1.75";
  fireEvent.submit(screen.getByRole("button", { name: "Correction save karein" }).closest("form")!);
  await waitFor(() => expect(mocks.correctAnimalFeedRecord).toHaveBeenCalledWith(expect.objectContaining({
    feedEntryId: "feed-1", itemId: "feed-item", quantity: 1.75, unit: "kg", note: "Morning feed",
  })));
});

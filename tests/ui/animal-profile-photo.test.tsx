import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { fixtures, makeFarmData, renderWithQuery } from "./utils";
import type { Animal, FarmData } from "@/lib/farm-data";

const photoMocks = vi.hoisted(() => ({
  removeAnimalPhoto: vi.fn(),
  replaceAnimalPhoto: vi.fn(),
  signedAnimalPhotoUrl: vi.fn(),
  refreshFarmViews: vi.fn(),
}));

vi.mock("@/lib/animal-photos", () => photoMocks);
vi.mock("@/lib/query-refresh", () => ({ refreshFarmViews: photoMocks.refreshFarmViews }));

import { AnimalProfilePhoto } from "@/components/AnimalProfilePhoto";

const animal = { ...fixtures.cow, photo_path: null } as Animal;
const cachedFarmData = () => makeFarmData({ animals: [animal] }) as unknown as FarmData;

afterEach(() => vi.clearAllMocks());

it("keeps the saved photo and reports a refresh warning when the upload refetch fails", async () => {
  const user = userEvent.setup();
  const photoPath = `${animal.id}/new-photo.jpg`;
  photoMocks.replaceAnimalPhoto.mockResolvedValue({ cleanupWarning: false, photoPath });
  photoMocks.refreshFarmViews.mockRejectedValue(new Error("temporary network failure"));
  const { client } = renderWithQuery(<AnimalProfilePhoto animal={animal} />);
  const queryKey = ["farm-data", "animals", animal.id, ""];
  client.setQueryData(queryKey, cachedFarmData());

  await user.upload(screen.getByLabelText("Tasveer upload karein"), new File(["photo"], "cow.jpg", { type: "image/jpeg" }));

  expect(await screen.findByText(/Photo save ho gayi/)).toHaveTextContent("page reload karein");
  expect(client.getQueryData<FarmData>(queryKey)?.animals[0].photo_path).toBe(photoPath);
  expect(screen.queryByText(/Photo save nahi hui/)).not.toBeInTheDocument();
});

it("keeps the removed state and reports a refresh warning when the removal refetch fails", async () => {
  const user = userEvent.setup();
  const animalWithPhoto = { ...animal, photo_path: `${animal.id}/old-photo.jpg` };
  photoMocks.signedAnimalPhotoUrl.mockResolvedValue("https://example.invalid/photo.jpg");
  photoMocks.removeAnimalPhoto.mockResolvedValue({ cleanupWarning: false, photoPath: null });
  photoMocks.refreshFarmViews.mockRejectedValue(new Error("temporary network failure"));
  const { client } = renderWithQuery(<AnimalProfilePhoto animal={animalWithPhoto} />);
  const queryKey = ["farm-data", "animals", animal.id, ""];
  client.setQueryData(queryKey, makeFarmData({ animals: [animalWithPhoto] }) as unknown as FarmData);
  Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });

  expect(screen.getByRole("button", { name: "Tasveer hata dein" })).toHaveClass("min-h-11");
  await user.click(screen.getByRole("button", { name: "Tasveer hata dein" }));

  expect(await screen.findByText(/Photo profile se hata di/)).toHaveTextContent("page reload karein");
  expect(client.getQueryData<FarmData>(queryKey)?.animals[0].photo_path).toBeNull();
  expect(screen.queryByText(/Photo nahi hati/)).not.toBeInTheDocument();
});

import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { fixtures, farmMocks, makeFarmData, renderWithQuery } from "./utils";
import FarmAnimals from "@/components/FarmAnimals";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

it("orders numeric tags before text tags and uses category when name is missing", () => {
  const cow = fixtures.cow;
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ animals: [
    { ...cow, id: "a3", tag: "1151", name: null, breed: "Holstein" },
    { ...cow, id: "a4", tag: "QA-7", name: null, category: "calf", breed: "Holstein" },
    { ...cow, id: "a1", tag: "81", name: "Moti", breed: "Holstein" },
    { ...cow, id: "a2", tag: "180", name: null, breed: "Holstein" },
  ] }), error: null });
  renderWithQuery(<FarmAnimals />);
  const links = screen.getAllByRole("link").filter((element) => element.getAttribute("href")?.startsWith("/janwar?id="));
  expect(links.map((element) => element.getAttribute("href"))).toEqual([
    "/janwar?id=a1", "/janwar?id=a2", "/janwar?id=a3", "/janwar?id=a4",
  ]);
  expect(links[0]).toHaveTextContent("Moti");
  expect(links[1]).toHaveTextContent("Gaye");
  expect(links[3]).toHaveTextContent("Bacha");
  expect(links[2].textContent?.match(/Holstein/g)).toHaveLength(1);
});

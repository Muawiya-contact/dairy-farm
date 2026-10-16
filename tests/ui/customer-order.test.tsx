import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { fixtures, farmMocks, makeFarmData, renderWithQuery } from "./utils";
import FarmMilk from "@/components/FarmMilk";
import FarmCustomers from "@/components/FarmCustomers";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/FarmObservances", () => ({ FarmObservances: () => null }));

it("shows milk and khata customers by sort order, then name", () => {
  const base = { ...fixtures.customer, opening_date: "2025-01-01", active: true };
  const customers = [
    { ...base, id: "c3", name: "Zara", sort_order: 2 },
    { ...base, id: "c1", name: "Bilal", sort_order: 1 },
    { ...base, id: "c2", name: "Ali", sort_order: 1 },
  ];
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ customers, balances: [], reports: [] }), error: null });
  const milk = renderWithQuery(<FarmMilk />);
  expect(screen.getAllByRole("spinbutton", { name: /(?:Ali|Bilal|Zara) litres/ }).map((element) => element.getAttribute("aria-label")))
    .toEqual(["Ali litres", "Bilal litres", "Zara litres"]);
  milk.unmount();
  renderWithQuery(<FarmCustomers />);
  expect(screen.getAllByRole("link", { name: /(?:Ali|Bilal|Zara)/ }).map((element) => element.getAttribute("href")))
    .toEqual(["/khata?id=c2", "/khata?id=c1", "/khata?id=c3"]);
});

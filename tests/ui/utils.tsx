import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactElement } from "react";
import { vi } from "vitest";

export const fixtures = vi.hoisted(() => ({
  today: "2026-10-16",
  cow: { id: "animal-1", tag: "101", name: "Gaye 101", species: "cow", sex: "female",
    category: "cow", milking_status: "milking", life_status: "active", source: "purchased",
    arrival_date: "2025-01-01", birth_date: "2023-01-01", updated_at: "2026-10-15T12:00:00Z" },
  account: { id: "account-1", name: "Farm galla", active: true, is_farm_cash: true },
  customer: { id: "customer-1", name: "Naqd", kind: "cash", default_morning: 0, default_evening: 0 },
}));

export const farmMocks = vi.hoisted(() => ({
  useFarmData: vi.fn(),
  saveMilkEntry: vi.fn(),
  closeAnimal: vi.fn(),
  updateAnimal: vi.fn(),
}));
export const supabaseMocks = vi.hoisted(() => ({ getSupabase: vi.fn() }));

vi.mock("@/lib/farm-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farm-data")>()),
  ...farmMocks,
}));
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  ...supabaseMocks,
}));

export function makeFarmData(overrides: Record<string, unknown> = {}) {
  return {
    today: fixtures.today,
    animals: [fixtures.cow],
    accounts: [fixtures.account],
    customers: [fixtures.customer],
    shifts: [], animalMilk: [], deliveries: [], rates: [], settings: {},
    health: [], inseminations: [], calvings: [], calvingOffspring: [], categories: [],
    ...overrides,
  };
}

export function renderWithQuery(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(ui, { wrapper: ({ children }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>, ...options });
  return { ...rendered, client };
}

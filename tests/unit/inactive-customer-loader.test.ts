import { beforeEach, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase";
import { loadInactiveCustomers } from "@/lib/reporting";

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }));

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  getSupabase: mocks.getSupabase,
}));

beforeEach(() => vi.clearAllMocks());

it("maps customer table IDs before excluding customers with period sales", async () => {
  const customerRows = [
    { id: "buyer-id", name: "Recent Buyer", phone: null, kind: "cash", active: true, sort_order: 1 },
    { id: "idle-id", name: "No Recent Sale", phone: null, kind: "regular", active: true, sort_order: 2 },
  ];
  const customerQuery = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data: customerRows, error: null }),
  };
  customerQuery.select.mockReturnValue(customerQuery);
  customerQuery.eq.mockReturnValue(customerQuery);
  customerQuery.order.mockReturnValue(customerQuery);
  const salesQuery = {
    range: vi.fn().mockResolvedValue({
      data: [{ customer_id: "buyer-id", litres: 1, charges: 0 }], error: null,
    }),
  };
  const supabase = {
    from: vi.fn().mockReturnValue(customerQuery),
    rpc: vi.fn().mockReturnValue(salesQuery),
  } as unknown as ReturnType<typeof getSupabase>;
  mocks.getSupabase.mockReturnValue(supabase);

  const result = await loadInactiveCustomers("2026-11-01", "2026-11-30");

  expect(result).toEqual([expect.objectContaining({ customer_id: "idle-id", name: "No Recent Sale" })]);
  expect(supabase.from).toHaveBeenCalledWith("customers");
  expect(salesQuery.range).toHaveBeenCalledWith(0, 999);
});

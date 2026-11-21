import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";
import { HerdReminders } from "@/components/HerdReminders";

beforeEach(() => {
  localStorage.clear();
  supabaseMocks.getSupabase.mockReturnValue({ rpc: vi.fn(async (name: string) => ({
    data: name === "animal_breeding_alerts" ? [{ animal_id: "cow-1", alert_kind: "ultrasound", due_date: "2026-10-20",
      tag: "101", message: "101: ultrasound — 2 din baad", days_left: 2, severity: "soon" }] : [], error: null,
  })) });
});

it("moves the reminder banner aside while the list is open and restores it for dismissal", async () => {
  const user = userEvent.setup();
  renderWithQuery(<HerdReminders />);
  const banner = await screen.findByRole("status");
  expect(banner).toHaveTextContent("Aaj ke kaam");

  await user.click(screen.getByRole("button", { name: "Dekhein" }));
  expect(screen.getByRole("region", { name: "Nasl aur sehat ki yaad-dihaniyan" })).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "1 yaad-dihaniyan" }));
  expect(screen.getByRole("status")).toHaveTextContent("Aaj ke kaam");
  await user.click(screen.getByRole("button", { name: "Theek hai" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("shows and locally acknowledges a production-drop alert without a milk write", async () => {
  const user = userEvent.setup();
  const rpc = vi.fn().mockResolvedValue({
    data: [{ animal_id: "cow-1", alert_kind: "milk_drop_morning", due_date: "2026-10-20",
      tag: "101", message: "101: subah ka doodh 7 din ke ausat se kam — ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam — 20 Oct",
      days_left: 0, severity: "today" }],
    error: null,
  });
  rpc.mockImplementation(async (name: string) => ({
    data: name === "herd_alerts" ? [{ animal_id: "cow-1", alert_kind: "milk_drop_morning", due_date: "2026-10-20",
      tag: "101", message: "101: subah ka doodh 7 din ke ausat se kam — ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam — 20 Oct",
      days_left: 0, severity: "today" }] : [], error: null,
  }));
  supabaseMocks.getSupabase.mockReturnValue({ rpc });
  renderWithQuery(<HerdReminders />);

  expect(await screen.findByRole("status")).toHaveTextContent("1 aaj");
  await user.click(screen.getByRole("button", { name: "Dekhein" }));
  expect(screen.getByRole("region", { name: "Nasl aur sehat ki yaad-dihaniyan" }))
    .toHaveTextContent("ausat 10.00 L, aaj 8.00 L; 2.00 L (20.0%) kam");
  await user.click(screen.getByRole("button", { name: "1 yaad-dihaniyan" }));
  await user.click(screen.getByRole("button", { name: "Theek hai" }));

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc).toHaveBeenCalledWith("herd_alerts", { p_today: expect.any(String) });
});

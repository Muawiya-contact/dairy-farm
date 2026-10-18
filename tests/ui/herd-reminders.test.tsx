import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";
import { HerdReminders } from "@/components/HerdReminders";

beforeEach(() => {
  localStorage.clear();
  supabaseMocks.getSupabase.mockReturnValue({ rpc: vi.fn().mockResolvedValue({
    data: [{ animal_id: "cow-1", alert_kind: "ultrasound", due_date: "2026-10-20",
      tag: "101", message: "101: ultrasound — 2 din baad", days_left: 2, severity: "soon" }],
    error: null,
  }) });
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

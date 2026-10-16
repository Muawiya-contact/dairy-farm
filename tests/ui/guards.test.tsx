import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";
import { MonthCloseSection } from "@/components/MonthCloseSection";
import { formatMonth } from "@/lib/dates";
import { previousMonth } from "@/lib/month-close";

const monthMocks = vi.hoisted(() => ({
  getMonthCloseSummary: vi.fn(), getMonthLocks: vi.fn(), getMonthLockEvents: vi.fn(),
  closeFarmMonth: vi.fn(), reopenFarmMonth: vi.fn(),
}));
vi.mock("@/lib/month-close", async (original) => ({
  ...(await original<typeof import("@/lib/month-close")>()), ...monthMocks,
}));

const summary = { produced: 100, sales: 15000, expenses: 5000, profit: 10000, gallaClosing: 7000, missingShifts: 0 };
beforeEach(() => {
  monthMocks.getMonthLocks.mockResolvedValue([]);
  monthMocks.getMonthLockEvents.mockResolvedValue([]);
  monthMocks.getMonthCloseSummary.mockResolvedValue(summary);
  monthMocks.closeFarmMonth.mockResolvedValue(true);
});

it("refuses to close when the server summary changed after review", async () => {
  const user = userEvent.setup();
  monthMocks.getMonthCloseSummary.mockResolvedValueOnce(summary).mockResolvedValueOnce({ ...summary, expenses: 6000 });
  renderWithQuery(<MonthCloseSection />);
  await screen.findByText("Paida hua doodh");
  await user.click(screen.getByRole("checkbox", { name: /Maine is maheene ka hisaab/ }));
  await user.click(screen.getByRole("button", { name: "Maheena band karein" }));
  await waitFor(() => expect(monthMocks.getMonthCloseSummary.mock.calls.length).toBeGreaterThanOrEqual(2));
  expect(monthMocks.closeFarmMonth).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent(/hisaab badal gaya/);
});

it("requires the exact displayed month before reopening", async () => {
  const user = userEvent.setup();
  const name = formatMonth(`${previousMonth()}-01`);
  monthMocks.getMonthLocks.mockResolvedValue([{ month: `${previousMonth()}-01`, locked_at: "2026-10-01T00:00:00Z" }]);
  renderWithQuery(<MonthCloseSection />);
  const button = await screen.findByRole("button", { name: "Maheena dobara kholein" });
  await user.type(screen.getByRole("textbox", { name: "Dobara kholne ki wajah" }), "Galat hisaab");
  await user.type(screen.getByRole("textbox", { name: new RegExp(`Tasdeeq ke liye ${name}`) }), "Wrong month");
  expect(button).toBeDisabled();
  expect(monthMocks.reopenFarmMonth).not.toHaveBeenCalled();
  await user.clear(screen.getByRole("textbox", { name: new RegExp(`Tasdeeq ke liye ${name}`) }));
  await user.type(screen.getByRole("textbox", { name: new RegExp(`Tasdeeq ke liye ${name}`) }), name);
  expect(button).toBeEnabled();
});

function authClient(session: unknown = null) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  supabaseMocks.getSupabase.mockReturnValue({ auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    resetPasswordForEmail, updateUser,
  } });
  return { resetPasswordForEmail, updateUser };
}

it("sends a password reset email from the forgot-password screen", async () => {
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_AUTH", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.resetModules();
  const { default: AuthGate } = await import("@/components/AuthGate");
  const { resetPasswordForEmail } = authClient();
  const user = userEvent.setup();
  renderWithQuery(<AuthGate><div>Private farm</div></AuthGate>);
  await screen.findByRole("button", { name: "Password bhool gaye?" });
  await user.click(screen.getByRole("button", { name: "Password bhool gaye?" }));
  await user.type(screen.getByRole("textbox", { name: "Email" }), "test@example.com");
  await user.click(screen.getByRole("button", { name: "Reset link bhejein" }));
  await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith("test@example.com", {
    redirectTo: `${window.location.origin}/`,
  }));
  vi.unstubAllEnvs();
});

it("blocks mismatched replacement passwords before contacting Auth", async () => {
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_AUTH", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  window.history.replaceState(null, "", "/#type=recovery&access_token=token-1");
  vi.resetModules();
  const { default: AuthGate } = await import("@/components/AuthGate");
  const { updateUser } = authClient({ access_token: "token-1", user: { id: "user-1" } });
  const user = userEvent.setup();
  renderWithQuery(<AuthGate><div>Private farm</div></AuthGate>);
  await screen.findByRole("button", { name: "Password save karein" });
  await user.type(screen.getByLabelText("Naya password"), "password123");
  await user.type(screen.getByLabelText("Password dobara"), "different123");
  await user.click(screen.getByRole("button", { name: "Password save karein" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Dono passwords aik jaisay likhein.");
  expect(updateUser).not.toHaveBeenCalled();
  window.history.replaceState(null, "", "/");
  vi.unstubAllEnvs();
});

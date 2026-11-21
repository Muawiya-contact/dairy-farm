import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithQuery, supabaseMocks } from "./utils";
import SettingsPage from "@/app/settings/page";

const settingsMocks = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock("@/lib/settings", async (original) => ({
  ...(await original<typeof import("@/lib/settings")>()),
  ...settingsMocks,
}));

const settings = {
  id: 1,
  farm_name: "Test Farm",
  owner_name: "Owner",
  contact_phone: "",
  go_live_date: null,
  default_milk_rate: 180,
  ultrasound_days: 30,
  checkup_days: 75,
  dry_off_days: 210,
  calving_days: 270,
  fresh_days: 60,
  reminder_days: 7,
  calving_reminder_days: 30,
  milk_drop_threshold_percent: 20,
  whatsapp_footer: "Shukriya",
  gyarhwin_reminder_enabled: true,
  hijri_date_adjustment: 0,
  eid_fitr_start_date: null,
  eid_adha_start_date: null,
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("farm-settings-section", "milk");
  settingsMocks.getSettings.mockResolvedValue(settings);
  settingsMocks.updateSettings.mockImplementation(async (values) => ({ ...settings, ...values }));
  supabaseMocks.getSupabase.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  } as never);
});

it("lets the owner save a changed milk-drop threshold while the milk section is open", async () => {
  const user = userEvent.setup();
  renderWithQuery(<SettingsPage />);

  const threshold = await screen.findByLabelText("Kami ka threshold (feesad)");
  expect(screen.getByRole("button", { name: "Save karein" })).toBeVisible();
  await user.clear(threshold);
  await user.type(threshold, "35");
  await user.click(screen.getByRole("button", { name: "Save karein" }));

  expect(settingsMocks.updateSettings).toHaveBeenCalledOnce();
  expect(settingsMocks.updateSettings.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ milk_drop_threshold_percent: 35 }));
  expect(await screen.findByRole("status")).toHaveTextContent("Settings farm ke data mein save ho gayi.");
});

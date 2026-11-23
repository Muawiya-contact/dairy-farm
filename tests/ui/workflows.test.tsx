import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { fixtures, farmMocks, makeFarmData, renderWithQuery, supabaseMocks } from "./utils";
import FarmMilk from "@/components/FarmMilk";
import { AnimalManagement } from "@/components/AnimalManagement";
import { AnimalBreeding } from "@/components/AnimalBreeding";
import FarmAnimals from "@/components/FarmAnimals";
import StaffSalary from "@/components/StaffSalary";
import { todayPK } from "@/lib/dates";

const salaryMocks = vi.hoisted(() => ({ loadSalaryData: vi.fn(), recordSalaryPayment: vi.fn() }));
vi.mock("@/lib/salary", async (original) => ({ ...(await original<typeof import("@/lib/salary")>()), ...salaryMocks }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/FarmObservances", () => ({ FarmObservances: () => null }));

beforeEach(() => {
  supabaseMocks.getSupabase.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: true, error: null }) });
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData(), error: null });
  farmMocks.saveMilkEntry.mockResolvedValue("2026-10-16T12:00:00Z");
  farmMocks.correctMilkEntry.mockResolvedValue("2026-10-16T12:00:01Z");
  farmMocks.closeAnimal.mockResolvedValue(undefined);
  salaryMocks.recordSalaryPayment.mockResolvedValue(undefined);
});

it("adds 7.3 L from one animal, blocks excess deliveries, and fills company milk only once", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ customers: [
    { ...fixtures.customer, active: true, opening_date: "2025-01-01" },
    { id: "company-1", name: "Collection", kind: "company", active: true, opening_date: "2025-01-01", default_morning: 0, default_evening: 0 },
  ] }), error: null });
  renderWithQuery(<FarmMilk />);
  await user.click(screen.getByRole("button", { name: "Har janwar" }));
  await user.type(screen.getByRole("spinbutton", { name: "101 litres" }), "7.3");
  expect(screen.getAllByText("7.3 L").length).toBeGreaterThanOrEqual(2);
  await user.type(screen.getByRole("spinbutton", { name: "Naqd litres" }), "8");
  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  expect(within(screen.getByRole("dialog", { name: "Entry pehle check karein" })).getByText(/chiller ke is waqt available doodh se zyada/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Theek hai, durust karta hoon" }));
  await user.clear(screen.getByRole("spinbutton", { name: "Naqd litres" }));
  const fill = screen.getByRole("button", { name: "Baqi company ko dein" });
  await user.dblClick(fill);
  expect(screen.getByRole("spinbutton", { name: "Collection litres" })).toHaveValue(7.3);
});

it("refreshes galla and customer reports after saving milk", async () => {
  const user = userEvent.setup();
  const { client } = renderWithQuery(<FarmMilk />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await user.type(screen.getByRole("spinbutton", { name: "Kul doodh" }), "7.3");
  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  await waitFor(() => expect(farmMocks.saveMilkEntry).toHaveBeenCalledOnce());
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customer-report"] }, { throwOnError: true }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["galla"] }, { throwOnError: true });
});

it("saves Khata, cash, free, internal use, and wastage separately in one balanced shift", async () => {
  const user = userEvent.setup();
  const cash = { ...fixtures.customer, id: "cash-1", name: "Naqd", kind: "cash", active: true, is_local: false, opening_date: "2025-01-01", default_morning: 0 };
  const khata = { ...cash, id: "khata-1", name: "Ahmed", kind: "regular" };
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ customers: [khata, cash] }), error: null });
  renderWithQuery(<FarmMilk />);
  await user.type(screen.getByRole("spinbutton", { name: "Kul doodh" }), "500");
  await user.type(screen.getByRole("spinbutton", { name: "Ahmed litres" }), "65");
  await user.type(screen.getByRole("spinbutton", { name: "Naqd litres" }), "75");
  await user.click(screen.getByRole("button", { name: "Free milk add karein" }));
  await user.type(screen.getByRole("spinbutton", { name: "Free milk / diya hua 1 litres" }), "10");
  await user.type(screen.getByRole("textbox", { name: "Free milk / diya hua 1 recipient" }), "Ismail");
  await user.click(screen.getByRole("button", { name: "Istemaal add karein" }));
  await user.type(screen.getByRole("spinbutton", { name: "Farm / home use 1 litres" }), "5");
  await user.click(screen.getByRole("button", { name: "Waste add karein" }));
  await user.type(screen.getByRole("spinbutton", { name: "Wastage / spillage 1 litres" }), "5");
  await user.type(screen.getByRole("textbox", { name: "Wastage / spillage 1 note" }), "Balti gir gayi");
  expect(screen.getByText("340 L")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  await waitFor(() => expect(farmMocks.saveMilkEntry).toHaveBeenCalledWith(expect.objectContaining({
    total: 500,
    deliveries: [{ customer_id: "khata-1", litres: 65 }, { customer_id: "cash-1", litres: 75 }],
    dispositions: [
      { disposition_type: "free", category: "charity", litres: 10, recipient: "Ismail", note: null },
      { disposition_type: "internal", category: "owner_home", litres: 5, recipient: null, note: null },
      { disposition_type: "wastage", category: "spillage", litres: 5, recipient: null, note: "Balti gir gayi" },
    ],
  })));
});

it("shows combined daily totals and the saved breakdown for each shift", async () => {
  farmMocks.loadMilkDayDistribution.mockResolvedValueOnce({
    report_date: fixtures.today, opening_litres: 10, produced_litres: 300, available_litres: 310,
    khata_litres: 20, cash_litres: 30, free_litres: 5, farm_use_litres: 4, wasted_litres: 1,
    allocated_litres: 60, remaining_litres: 250, khata_amount: 2000, cash_sale_amount: 4500,
    cash_received: 4500, shifts: [{ milk_shift: "morning", produced_litres: 100, khata_litres: 10,
      opening_litres: 10, available_litres: 110,
      cash_litres: 15, free_litres: 2, farm_use_litres: 1, wasted_litres: 0, allocated_litres: 28,
      remaining_litres: 72, khata_amount: 1000, cash_sale_amount: 2250, cash_received: 2250 }] as never,
  });
  renderWithQuery(<FarmMilk />);
  const summary = await screen.findByRole("region", { name: "Subah shift summary" });
  expect(summary).toHaveTextContent("100 L");
  expect(summary).toHaveTextContent("15 L");
  expect(summary).toHaveTextContent("10 L");
  expect(summary).toHaveTextContent("110 L");
  expect(summary).toHaveTextContent("Rs 2,250");
  expect(screen.getByText("Rs 6,500")).toBeInTheDocument();
});

it("allocates against chiller stock after today's production is used", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ customers: [{ ...fixtures.customer,
    name: "Buyer", kind: "regular", active: true, opening_date: "2025-01-01" }] }), error: null });
  farmMocks.loadMilkDayDistribution.mockResolvedValueOnce({
    report_date: fixtures.today, opening_litres: 4219, produced_litres: 0, available_litres: 4219,
    khata_litres: 0, cash_litres: 0, free_litres: 0, farm_use_litres: 0, wasted_litres: 0,
    allocated_litres: 0, remaining_litres: 4219, khata_amount: 0, cash_sale_amount: 0, cash_received: 0, shifts: [],
  });
  renderWithQuery(<FarmMilk />);
  await screen.findAllByText("4,219 L");
  await user.type(screen.getByRole("spinbutton", { name: "Kul doodh" }), "500");
  await user.type(screen.getByRole("spinbutton", { name: "Buyer litres" }), "505");
  expect(screen.getAllByText("4,214 L").length).toBeGreaterThan(0);
  const save = screen.getByRole("button", { name: "Entry save karein" });
  expect(save).toBeEnabled();
  await user.click(save);
  await waitFor(() => expect(farmMocks.saveMilkEntry).toHaveBeenCalledWith(expect.objectContaining({
    total: 500, deliveries: [{ customer_id: "customer-1", litres: 505 }],
  })));
});

it("requires a reason before correcting a saved milk shift and sends one audited correction", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ shifts: [{ id: "shift-1", milk_date: fixtures.today,
    shift: "morning", total_litres: 10, mode: "total", notes: null, updated_at: "2026-10-16T12:00:00Z" }] }), error: null });
  renderWithQuery(<FarmMilk />);
  await user.click(screen.getByRole("button", { name: "Durust entry save karein" }));
  const dialog = screen.getByRole("dialog", { name: "Entry pehle check karein" });
  expect(within(dialog).getByText(/Miktar durust karne ki wajah kam az kam 3 harf/)).toBeVisible();
  expect(farmMocks.correctMilkEntry).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Theek hai, durust karta hoon" }));
  expect(screen.getByRole("textbox", { name: "Miktar durust karne ki wajah" })).toHaveFocus();
  await user.type(screen.getByRole("textbox", { name: "Miktar durust karne ki wajah" }), "Transfer mein kami");
  await user.click(screen.getByRole("button", { name: "Durust entry save karein" }));
  await waitFor(() => expect(farmMocks.correctMilkEntry).toHaveBeenCalledOnce());
  expect(farmMocks.correctMilkEntry).toHaveBeenCalledWith(expect.objectContaining({ reason: "Transfer mein kami", expectedUpdatedAt: "2026-10-16T12:00:00Z" }));
  expect(farmMocks.saveMilkEntry).not.toHaveBeenCalled();
});

it("keeps showing the save dialog until a missing wastage reason is fixed", async () => {
  const user = userEvent.setup();
  renderWithQuery(<FarmMilk />);
  await user.type(screen.getByRole("spinbutton", { name: "Kul doodh" }), "10");
  await user.click(screen.getByRole("button", { name: "Waste add karein" }));
  await user.type(screen.getByRole("spinbutton", { name: "Wastage / spillage 1 litres" }), "1");
  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  expect(within(screen.getByRole("dialog", { name: "Entry pehle check karein" })).getByText(/Zaya doodh ki kam az kam 3 harf/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Theek hai, durust karta hoon" }));
  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  expect(screen.getByRole("dialog", { name: "Entry pehle check karein" })).toBeVisible();
  expect(farmMocks.saveMilkEntry).not.toHaveBeenCalled();
});

it("keeps an explicitly saved zero per-animal row when correcting a shift", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    shifts: [{ id: "shift-1", milk_date: fixtures.today, shift: "morning", total_litres: 0, mode: "per_animal", notes: null, updated_at: "2026-10-16T12:00:00Z" }],
    animalMilk: [{ id: "animal-milk-1", shift_id: "shift-1", animal_id: fixtures.cow.id, litres: 0 }],
  }), error: null });
  renderWithQuery(<FarmMilk />);
  expect(screen.getByRole("spinbutton", { name: "101 litres" })).toHaveValue(0);
  await user.type(screen.getByRole("textbox", { name: "Miktar durust karne ki wajah" }), "Zero was checked");
  await user.click(screen.getByRole("button", { name: "Durust entry save karein" }));
  await waitFor(() => expect(farmMocks.correctMilkEntry).toHaveBeenCalledWith(expect.objectContaining({
    mode: "per_animal", total: 0, animals: [{ animal_id: fixtures.cow.id, litres: 0 }], reason: "Zero was checked",
  })));
});

it("keeps a zero milk reading when the animal decrement reaches zero", async () => {
  const user = userEvent.setup();
  const secondCow = { ...fixtures.cow, id: "animal-2", tag: "102", name: "Gaye 102" };
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ animals: [fixtures.cow, secondCow] }), error: null });
  renderWithQuery(<FarmMilk />);

  await user.click(screen.getByRole("button", { name: "Har janwar" }));
  await user.click(screen.getByRole("button", { name: "101 zyada" }));
  await user.click(screen.getByRole("button", { name: "101 kam" }));
  expect(screen.getByRole("spinbutton", { name: "101 litres" })).toHaveValue(0);
  expect(screen.getByRole("spinbutton", { name: "102 litres" })).toHaveValue(null);

  await user.click(screen.getByRole("button", { name: "Entry save karein" }));
  await waitFor(() => expect(farmMocks.saveMilkEntry).toHaveBeenCalledWith(expect.objectContaining({
    mode: "per_animal", total: 0, animals: [{ animal_id: fixtures.cow.id, litres: 0 }],
  })));
});

it("shows the noon tab and prefills the customer's noon default", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ customers: [{ ...fixtures.customer,
    active: true, opening_date: "2025-01-01", default_noon: 2 }] }), error: null });
  renderWithQuery(<FarmMilk />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Subah", "Dopehr", "Shaam"]);
  await user.click(screen.getByRole("tab", { name: "Dopehr" }));
  expect(screen.getByRole("spinbutton", { name: "Naqd litres" })).toHaveValue(2);
});

it("hides noon when off but keeps an already recorded historical noon tab", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    milkShiftConfig: [{ effective_from: fixtures.today, noon_enabled: false }],
  }), error: null });
  const view = renderWithQuery(<FarmMilk />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Subah", "Shaam"]);
  view.unmount();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    milkShiftConfig: [{ effective_from: fixtures.today, noon_enabled: false }],
    shifts: [{ id: "noon-1", milk_date: fixtures.today, shift: "noon", total_litres: 3, mode: "total", updated_at: "2026-10-16T12:00:00Z" }],
  }), error: null });
  renderWithQuery(<FarmMilk />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Subah", "Dopehr*", "Shaam"]);
  expect(screen.getByText(/pehle se darj entry hai; nayi Dopehr entry nahi banegi/)).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Dopehr*" }));
  expect(screen.getByRole("button", { name: "Durust entry save karein" })).toBeVisible();
});

it("confirms an animal sale before writing and refreshes all dependent views", async () => {
  const user = userEvent.setup();
  const { client } = renderWithQuery(<AnimalManagement animal={fixtures.cow as never} animals={[fixtures.cow] as never} accounts={[fixtures.account] as never} today={fixtures.today} />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await user.click(screen.getByRole("button", { name: /Farokht \/ wafat/ }));
  await user.type(screen.getByRole("spinbutton", { name: /Mili hui raqam/ }), "50000.01");
  await user.selectOptions(screen.getByRole("combobox", { name: /Raqam kis account/ }), fixtures.account.id);
  const saleForm = screen.getByRole("button", { name: "Farokht darj karein" }).closest("form")!;
  // happy-dom marks valid money values as stepMismatch when min and step are both 0.01.
  saleForm.noValidate = true;
  await user.click(screen.getByRole("button", { name: "Farokht darj karein" }));
  expect(farmMocks.closeAnimal).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog", { name: /Farokht/ });
  await user.click(within(dialog).getByRole("button", { name: /Farokht/ }));
  await waitFor(() => expect(farmMocks.closeAnimal).toHaveBeenCalledOnce());
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customer-report"] }, { throwOnError: true }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["farm-data"] }, { throwOnError: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["galla"] }, { throwOnError: true });
});

it("confirms calving and ignores two fast confirmation taps", async () => {
  const user = userEvent.setup();
  const rpc = vi.fn().mockResolvedValue({ error: null });
  supabaseMocks.getSupabase.mockReturnValue({ rpc });
  const run = vi.fn(async (action: () => Promise<void>) => action());
  const record = { id: "service-1", animal_id: fixtures.cow.id, status: "pregnant", service_date: "2026-01-01",
    calving_due: fixtures.today, ultrasound_due: "2026-02-01", checkup_due: "2026-03-01", dry_off_due: "2026-08-01",
    semen_type: "normal", updated_at: "2026-01-01T00:00:00Z" };
  renderWithQuery(<AnimalBreeding animal={fixtures.cow as never} animals={[fixtures.cow] as never} records={[record] as never}
    calvings={[]} offspring={[]} today={fixtures.today} busy={false} run={run} />);
  await user.selectOptions(screen.getByRole("combobox", { name: /Jins \(zaroori\)/ }), "female");
  await user.click(screen.getByRole("button", { name: "Paidaish aur bachay save karein" }));
  expect(rpc).not.toHaveBeenCalled();
  const confirm = within(screen.getByRole("dialog", { name: /Paidaish/ })).getByRole("button", { name: /Paidaish/ });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
});

it("confirms salary payment and ignores two fast confirmation taps", async () => {
  const user = userEvent.setup();
  const today = todayPK();
  salaryMocks.loadSalaryData.mockResolvedValue({
    staff: [{ id: "staff-1", name: "Ismail", active: true, monthly_salary: 25000 }],
    periods: [{ id: "period-1", staff_id: "staff-1", salary_month: `${today.slice(0, 7)}-01`, agreed_amount: 25000 }],
    payments: [], accounts: [fixtures.account], categories: [{ id: "salary-category", name: "Tankhwah", active: true, is_salary: true, is_farm_cost: true }],
  });
  const { client } = renderWithQuery(<StaffSalary />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await screen.findByRole("button", { name: "Tankhwah save karein" });
  await user.selectOptions(screen.getByRole("combobox", { name: /Paisa kis account/ }), fixtures.account.id);
  await user.type(screen.getByRole("spinbutton", { name: /Adaigi ki raqam/ }), "5000.01");
  const payForm = screen.getByRole("button", { name: "Tankhwah save karein" }).closest("form")!;
  payForm.noValidate = true;
  await user.click(screen.getByRole("button", { name: "Tankhwah save karein" }));
  expect(salaryMocks.recordSalaryPayment).not.toHaveBeenCalled();
  const confirm = within(screen.getByRole("dialog", { name: /Tankhwah/ })).getByRole("button", { name: /Tankhwah/ });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(salaryMocks.recordSalaryPayment).toHaveBeenCalledOnce());
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customer-report"] }, { throwOnError: true }));
});

it("excludes sold and dead animals from active species filters", async () => {
  const user = userEvent.setup();
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({ animals: [fixtures.cow,
    { ...fixtures.cow, id: "sold-1", tag: "SOLD", name: "Sold cow", life_status: "sold" },
    { ...fixtures.cow, id: "dead-1", tag: "DEAD", name: "Dead buffalo", species: "buffalo", life_status: "dead" },
  ] }), error: null });
  renderWithQuery(<FarmAnimals />);
  await user.click(screen.getByRole("button", { name: "Gayein" }));
  expect(screen.queryByText("Sold cow")).not.toBeInTheDocument();
  expect(screen.queryByText("Dead buffalo")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Bhainsein" }));
  expect(screen.queryByText("Sold cow")).not.toBeInTheDocument();
  expect(screen.queryByText("Dead buffalo")).not.toBeInTheDocument();
});

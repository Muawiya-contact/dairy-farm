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
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData(), error: null });
  farmMocks.saveMilkEntry.mockResolvedValue("2026-10-16T12:00:00Z");
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
  expect(screen.getByRole("button", { name: "Entry save karein" })).toBeDisabled();
  await user.clear(screen.getByRole("spinbutton", { name: "Naqd litres" }));
  const fill = screen.getByRole("button", { name: "Baqi collection center ko" });
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
  expect(screen.getByRole("button", { name: "Darj Dopehr entry durust karein" })).toBeVisible();
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

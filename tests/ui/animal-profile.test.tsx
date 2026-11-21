import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { fixtures, farmMocks, makeFarmData, renderWithQuery, supabaseMocks } from "./utils";
import FarmAnimals from "@/components/FarmAnimals";
import { longDate } from "@/lib/farm-data";

const route = vi.hoisted(() => ({ id: "animal-1" }));
const documentMocks = vi.hoisted(() => ({ sharePdfFile: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(route.id ? `id=${route.id}` : "") }));
vi.mock("@/lib/pdf-share", () => ({ sharePdfFile: documentMocks.sharePdfFile }));
vi.mock("@/lib/export-data", async (original) => ({
  ...(await original<typeof import("@/lib/export-data")>()), downloadBlob: documentMocks.downloadBlob,
}));

beforeEach(() => {
  supabaseMocks.getSupabase.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  } as never);
});

it("shows life, production, breeding, and health as separate dimensions", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    animals: [{ ...fixtures.cow, seller_name: "Market seller", purchase_location: "Okara", photo_path: null }],
    settings: { farm_name: "Farm" },
    animalStatus: [{ id: fixtures.cow.id, breeding_status: "pregnant", service_date: "2026-10-01", calving_due: "2027-06-28" }],
    health: [{ id: "health-1", animal_id: fixtures.cow.id, event_date: "2026-10-15", kind: "treatment", title: "Hoof care",
      medicine: "Medicine A", vet: "Dr A", notes: null, cost: 0, next_due_date: "2026-10-20", expense_id: null }],
    alerts: [{ alert_kind: "dry_off", severity: "soon", due_date: "2026-11-22", animal_id: fixtures.cow.id,
      tag: fixtures.cow.tag, message: `${fixtures.cow.tag}: khushk karna — 1 din baad`, days_left: 1 }],
    animalMilk: [
      { id: "milk-morning", shift_id: "shift-morning", animal_id: fixtures.cow.id, litres: 0.1 },
      { id: "milk-evening", shift_id: "shift-evening", animal_id: fixtures.cow.id, litres: 0.2 },
    ],
    shifts: [
      { id: "shift-morning", milk_date: "2026-10-16", shift: "morning", total_litres: 0.1, mode: "per_animal", notes: null, updated_at: "2026-10-16T06:00:00Z" },
      { id: "shift-evening", milk_date: "2026-10-16", shift: "evening", total_litres: 0.2, mode: "per_animal", notes: null, updated_at: "2026-10-16T18:00:00Z" },
    ],
  }), error: null });
  renderWithQuery(<FarmAnimals />);
  expect(screen.getByText("Farm mein haisiyat")).toBeInTheDocument();
  expect(screen.getByText("Doodh ki haisiyat")).toBeInTheDocument();
  expect(screen.getByText("Nasl kashi ki haisiyat")).toBeInTheDocument();
  expect(screen.getByText("Sehat ka agla kaam")).toBeInTheDocument();
  expect(screen.getByText("Gaabhan")).toBeInTheDocument();
  expect(screen.getByText("Market seller")).toBeInTheDocument();
  expect(screen.getByText("Okara")).toBeInTheDocument();
  expect(screen.getByText(/Hoof care · agla check-up/)).toBeInTheDocument();
  expect(screen.getByText(/0\.3 L/)).toBeInTheDocument();
  expect(screen.getByText("0.04 L rozana")).toBeInTheDocument();
  expect(screen.getByText(/khushk karna — 1 din baad/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PDF download karein" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Excel download karein" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PDF share karein" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "WhatsApp kholein" })).toHaveAttribute("href", expect.stringContaining("wa.me/"));
  expect(screen.getByRole("button", { name: "Print karein" })).toBeInTheDocument();
});

it("does not show a zero animal average for a total-only milk shift", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    animalStatus: [],
    shifts: [{ id: "shift-total", milk_date: "2026-10-16", shift: "morning", total_litres: 20, mode: "total", notes: null, updated_at: "2026-10-16T06:00:00Z" }],
  }), error: null });
  renderWithQuery(<FarmAnimals />);
  expect(screen.getByText("Total shift ke saath per-janwar ausat mukammal nahi")).toBeInTheDocument();
});

it("keeps sparse legacy profiles readable and shows no-record states", () => {
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    animals: [{ ...fixtures.cow, id: "old", birth_date: null, arrival_date: null, estimated_age_months_at_arrival: null,
      mother_id: null, purchase_date: null, purchase_price: null, seller_name: null, purchase_location: null, photo_path: null }],
    settings: { farm_name: "Farm" }, animalStatus: [], health: [], animalMilk: [], inseminations: [], calvings: [], calvingOffspring: [], shifts: [],
  }), error: null });
  route.id = "old";
  renderWithQuery(<FarmAnimals />);
  expect(screen.getByText("Doodh ka record nahi")).toBeInTheDocument();
  expect(screen.getAllByText("Sehat ka record nahi").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Darj nahi").length).toBeGreaterThan(0);
  route.id = "animal-1";
});

it("prints the profile from its explicit print action", async () => {
  const user = userEvent.setup();
  const print = vi.fn();
  Object.defineProperty(window, "print", { configurable: true, value: print });
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    animals: [{ ...fixtures.cow, photo_path: null }], settings: { farm_name: "Farm" }, animalStatus: [],
    inseminations: [{ id: "cycle-1", animal_id: fixtures.cow.id, service_date: "2026-10-01", semen_type: "normal",
      status: "pregnant", ultrasound_due: "2026-10-30", ultrasound_due_override: null, ultrasound_date: null,
      checkup_due: "2026-12-15", checkup_due_override: null, checkup_date: null, dry_off_due: "2027-05-01",
      dry_off_due_override: null, dry_off_date: null, calving_due: "2027-06-28", calving_due_override: "2027-07-10" }] as never,
  }), error: null });
  renderWithQuery(<FarmAnimals />);
  const printReport = document.querySelector(".animal-profile-print");
  expect(printReport).toHaveTextContent(`Mutawaqqa paidaish ${longDate("2027-07-10")}`);
  expect(printReport).not.toHaveTextContent(longDate("2027-06-28"));
  await user.click(screen.getByRole("button", { name: "Print karein" }));
  expect(print).toHaveBeenCalledOnce();
  Object.defineProperty(window, "print", { configurable: true, value: undefined });
});

it("reports desktop sharing as a download for manual attachment", async () => {
  const user = userEvent.setup();
  documentMocks.sharePdfFile.mockResolvedValue("downloaded");
  farmMocks.useFarmData.mockReturnValue({ data: makeFarmData({
    animals: [{ ...fixtures.cow, photo_path: null }], settings: { farm_name: "Farm" }, animalStatus: [],
  }), error: null });
  renderWithQuery(<FarmAnimals />);
  await user.click(screen.getByRole("button", { name: "PDF share karein" }));
  expect(await screen.findByText(/PDF download ho gaya\. WhatsApp ya doosri app mein khud attach karein/)).toBeInTheDocument();
  expect(documentMocks.sharePdfFile).toHaveBeenCalledOnce();
  expect(screen.queryByText(/sent automatically|sent to WhatsApp/i)).not.toBeInTheDocument();
});

import { describe, expect, it } from "vitest";
import { buildAnimalDossierPdf, buildAnimalDossierWorkbook, type AnimalDossier } from "@/lib/animal-dossier";
import type { Animal } from "@/lib/farm-data";
import type { LoadedFarmSettings } from "@/lib/settings";

const cow = (id: string, tag: string): Animal => ({
  id, tag, name: null, species: "cow", breed: "Sahiwal", sex: "female", category: "cow", birth_date: null,
  arrival_date: "2026-01-01", estimated_age_months_at_arrival: null, mother_id: null, purchase_date: null,
  purchase_price: null, seller_name: null, purchase_location: null, photo_path: null, source: "purchased", sire: null,
  milking_status: "milking", life_status: "active", exit_date: null, exit_reason: null, sale_price: null,
  notes: null, updated_at: "2026-01-01T00:00:00Z",
});

const input: AnimalDossier = {
  animal: cow("animal-one", "A-101"), animals: [cow("animal-one", "A-101"), cow("other", "B-202")],
  farm: { id: 1, farm_name: "Test Farm", owner_name: "Farm Owner", contact_phone: "+923001234567", go_live_date: "2026-01-01" } as LoadedFarmSettings,
  today: "2026-11-21", status: { life: "active", production: "milking", breeding: "open", health: "no-record", healthDueDate: null },
  health: [], activeAlerts: [], inseminations: [], calvings: [], offspring: [], dueTasks: [],
  milk: [{ date: "2026-11-20", shift: "Morning", litres: 6.5 }],
};

describe("animal dossier exports", () => {
  it("creates a readable PDF for sparse animal history", async () => {
    const pdf = await buildAnimalDossierPdf(input);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("creates all requested structured sheets without exposing other animals", async () => {
    const bytes = await buildAnimalDossierWorkbook({
      ...input,
      activeAlerts: [{ alert_kind: "dry_off", severity: "soon", due_date: "2026-11-22", animal_id: "animal-one", tag: "A-101",
        message: "A-101: khushk karna — 1 din baad", days_left: 1 }],
    });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Profile", "Milk", "Breeding", "Health", "Vaccinations", "Calving & offspring", "Weight", "Feed", "Financial summary",
    ]);
    const profileValues = workbook.getWorksheet("Profile")!.getSheetValues().flat().map(String);
    expect(profileValues).toContain("A-101");
    expect(profileValues).toContain("A-101: khushk karna — 1 din baad");
    expect(profileValues).not.toContain("B-202");
    expect(workbook.getWorksheet("Milk")!.getRow(2).values).toContain("2026-11-20");
    expect(workbook.getWorksheet("Milk")!.getRow(2).values).toContain(6.5);
    expect(workbook.getWorksheet("Feed")!.getRow(2).getCell(1).value).toMatch(/No feed history/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAnimalDossierPdf, buildAnimalDossierWorkbook, type AnimalDossier } from "@/lib/animal-dossier";
import type { Animal, AnimalCareTask, AnimalFeedRecord, AnimalIncomeEntry, Calving, CalvingOffspring, HealthEvent, HealthEventAttachment } from "@/lib/farm-data";
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
  farm: { id: 1, farm_name: "Test Farm", owner_name: "Farm Owner", contact_phone: "+923001234567", go_live_date: "2026-01-01", default_milk_rate: 150 } as LoadedFarmSettings,
  today: "2026-11-21", status: { life: "active", production: "milking", breeding: "open", health: "no-record", healthDueDate: null },
  health: [], healthAttachments: [], activeAlerts: [], inseminations: [], calvings: [], offspring: [], animalWeights: [], animalFeed: [], animalIncome: [], dueTasks: [], milkShifts: [], careTasks: [],
  milk: [{ date: "2026-11-20", shift: "Morning", litres: 6.5 }],
};

beforeAll(() => vi.stubGlobal("fetch", async (url: string) => {
  const filename = url.split("/").pop();
  if (filename === "icon-192.png" || filename === "coding-moves-services.png") return new Response(readFileSync(resolve("public/brand", filename)));
  if (url.startsWith("/fonts/pdf/")) return new Response(readFileSync(resolve("public/fonts/pdf", filename!)));
  return new Response(null, { status: 404 });
}));
afterAll(() => vi.unstubAllGlobals());

describe("animal dossier exports", () => {
  it("uses the newest same-day health record in both profile summaries", async () => {
    const events = [
      { id: "older", animal_id: "animal-one", event_date: "2026-11-20", created_at: "2026-11-20T10:00:00Z", kind: "treatment", title: "Older entry" },
      { id: "newer", animal_id: "animal-one", event_date: "2026-11-20", created_at: "2026-11-20T11:00:00Z", kind: "treatment", title: "Newer entry" },
    ] as HealthEvent[];
    const bytes = await buildAnimalDossierWorkbook({ ...input, health: events });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const profileValues = workbook.getWorksheet("Janwar ka record")!.getSheetValues().flat().map(String);
    expect(profileValues).toContain("2026-11-20 · Newer entry");
    expect(profileValues).not.toContain("2026-11-20 · Older entry");

    const pdfText = new TextDecoder().decode(await buildAnimalDossierPdf({ ...input, health: events }));
    expect(pdfText).toContain("/NotoSans");
  });

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
      "Janwar ka record", "Doodh", "Nasl kashi", "Janwar ke follow-up", "Sehat ka record", "Teekay aur deworming", "Paidaish aur bachay", "Wazan", "Charah", "Maali khulasa",
    ]);
    const profileSheet = workbook.getWorksheet("Janwar ka record")!;
    const profileValues = profileSheet.getSheetValues().flat().map(String);
    expect(profileValues).toContain("A-101");
    expect(profileValues).toContain("Chalu");
    expect(profileValues).toContain("Doodh de rahi hai");
    expect(profileValues).not.toContain("active");
    expect(profileValues).not.toContain("milking");
    expect(profileSheet.getRow(1).values).toContain("Maloomat");
    expect(profileValues).toContain("A-101: khushk karna — 1 din baad");
    expect(profileValues).not.toContain("B-202");
    expect(workbook.getWorksheet("Doodh")!.getRow(2).values).toContain("2026-11-20");
    expect(workbook.getWorksheet("Doodh")!.getRow(2).values).toContain(6.5);
    expect(workbook.getWorksheet("Charah")!.getRow(2).getCell(1).value).toBe("App mein charah dene ka record nahi.");
    const pdfText = new TextDecoder().decode(await buildAnimalDossierPdf(input));
    expect(pdfText).toContain("/BricolageGrotesque");
  });

  it("includes only the selected animal's calving and offspring details", async () => {
    const bytes = await buildAnimalDossierWorkbook({
      ...input,
      animals: [...input.animals, cow("calf-two", "B-202")],
      calvings: [{ id: "calving-one", animal_id: "animal-one", calf_id: "calf-two", calving_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z",
        ease_score: null, insemination_id: null, notes: "Routine calving", outcome: "normal", request_hash: null, request_id: null } as Calving],
      offspring: [{ id: "offspring-one", calving_id: "calving-one", animal_id: "calf-two", birth_order: 1, birth_weight_kg: 31.5,
        created_at: "2026-10-01T00:00:00Z", notes: "Healthy calf", outcome: "alive", sex: "female", tag_at_birth: "B-202" } as CalvingOffspring],
    });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const calvingSheet = workbook.getWorksheet("Paidaish aur bachay")!;
    expect(calvingSheet.getRow(2).values).toContain("2026-10-01");
    expect(calvingSheet.getRow(2).values).toContain("B-202");
    expect(calvingSheet.getRow(2).values).toContain(31.5);
    expect(calvingSheet.getRow(2).values).toContain("Routine calving · Healthy calf");
  });

  it("keeps completed care reminders in the animal dossier history", async () => {
    const careTask = { id: "task-one", animal_id: "animal-one", category: "vaccination", title: "FMD vaccine", due_date: "2026-11-20",
      notes: null, completed_date: "2026-11-20", completion_notes: "Given by vet", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-20T00:00:00Z" } as AnimalCareTask;
    const bytes = await buildAnimalDossierWorkbook({ ...input, careTasks: [careTask] });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("Janwar ke follow-up")!.getSheetValues().flat().map(String)).toEqual(expect.arrayContaining(["FMD vaccine", "Mukammal", "Given by vet"]));
  });

  it("exports complete veterinary details and only the selected event's private attachment name", async () => {
    const healthEvent = {
      id: "health-one", animal_id: "animal-one", event_date: "2026-11-20", kind: "treatment", title: "Hoof check",
      medicine: "Vet product", vet: "Dr. Farm", notes: "Owner note", cost: 175, next_due_date: "2026-11-27", expense_id: "expense-one",
      created_at: "2026-11-20T00:00:00Z", symptoms: "Limping", diagnosis: "Vet-entered hoof injury", severity: "moderate",
      current_condition: "Recovering", medicine_type: "Topical", dosage: "Recorded from vet note", route: "Topical",
      treatment_start_date: "2026-11-20", treatment_end_date: "2026-11-22",
    } as HealthEvent;
    const vaccine = { ...healthEvent, id: "health-vaccine", kind: "vaccine", title: "FMD shot" } as HealthEvent;
    const attachments = [
      { id: "file-one", health_event_id: healthEvent.id, file_name: "prescription.pdf", storage_path: "private/event/file.pdf", content_type: "application/pdf", size_bytes: 800, created_at: "2026-11-20T00:00:00Z" },
      { id: "file-other", health_event_id: "other-event", file_name: "other-animal.pdf", storage_path: "private/other/file.pdf", content_type: "application/pdf", size_bytes: 800, created_at: "2026-11-20T00:00:00Z" },
    ] as HealthEventAttachment[];
    const bytes = await buildAnimalDossierWorkbook({ ...input, health: [healthEvent, vaccine], healthAttachments: attachments });
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const healthValues = workbook.getWorksheet("Sehat ka record")!.getRow(2).values;
    expect(healthValues).toEqual(expect.arrayContaining([
      "Limping", "Vet-entered hoof injury", "Darmiyani", "Recovering", "Topical", "Recorded from vet note",
      "2026-11-20", "2026-11-22", "prescription.pdf",
    ]));
    expect(workbook.getWorksheet("Sehat ka record")!.getSheetValues().flat().map(String)).not.toContain("other-animal.pdf");
    expect(workbook.getWorksheet("Teekay aur deworming")!.getRow(2).values).toEqual(expect.arrayContaining(["FMD shot", "Vet product"]));
  });

  it("sums fractional health costs in paise for both dossier exports", async () => {
    const health = [0.1, 0.2].map((cost, index) => ({
      id: `health-${index + 1}`, animal_id: "animal-one", expense_id: `expense-${index + 1}`, event_date: `2026-11-${19 + index}`,
      kind: "treatment", title: `Treatment ${index + 1}`, medicine: null, vet: null, notes: null,
      cost, next_due_date: null, created_at: `2026-11-${19 + index}T00:00:00Z`,
    } satisfies HealthEvent));
    const dossier = { ...input, health };
    const bytes = await buildAnimalDossierWorkbook(dossier);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const financialRows = workbook.getWorksheet("Maali khulasa")!.getSheetValues().slice(1) as unknown[][];
    const includedCosts = financialRows.filter((row) => row[5] === "Darj kharcha" && row[6] === "Haan").map((row) => Number(row[4]));
    expect(includedCosts.reduce((sum, amount) => sum + Math.round(amount * 100), 0)).toBe(30);

    const pdfText = new TextDecoder().decode(await buildAnimalDossierPdf(dossier));
    expect(pdfText).not.toContain("0.30000000000000004");
  });

  it("exports audited feed history and recorded versus estimated animal finance", async () => {
    const animal = { ...cow("animal-one", "A-101"), purchase_date: "2025-01-01", purchase_price: 1000,
      life_status: "sold", exit_date: "2026-11-20", sale_price: 2000 } as Animal;
    const feed = (overrides: Partial<AnimalFeedRecord>): AnimalFeedRecord => ({
      id: "feed-one", animal_id: animal.id, inventory_item_id: "item-one", feed_date: "2026-11-19", quantity: 2,
      unit: "kg", stock_quantity: 2, stock_unit: "kg", note: null, stock_movement_id: "movement-one",
      request_id: "request-one", request_payload: {}, supersedes_id: null, created_at: "2026-11-19T10:00:00Z",
      item_name: "Wanda", category_name: "Animal feed & fodder", item_base_unit: "kg", superseded_by: null, ...overrides,
    });
    const health = [{ id: "health-one", animal_id: animal.id, event_date: "2026-11-01", kind: "treatment",
      title: "Vet visit", cost: 100, expense_id: "expense-one", created_at: "2026-11-01T10:00:00Z" } as HealthEvent];
    const sale = { id: "income-one", animal_id: animal.id, income_date: "2026-11-20", kind: "animal_sale",
      amount: 2000, account_id: "account-one", note: "Sale", created_at: "2026-11-20T10:00:00Z" } as AnimalIncomeEntry;
    const dossier = { ...input, animal, health, animalIncome: [sale], milk: [{ date: "2026-11-20", shift: "Morning", litres: 6.5 }],
      animalFeed: [feed({ id: "feed-one", superseded_by: "feed-two" }), feed({ id: "feed-two", quantity: 1.5,
        stock_quantity: 1.5, supersedes_id: "feed-one", created_at: "2026-11-20T10:00:00Z", note: "Corrected" })] };

    const bytes = await buildAnimalDossierWorkbook(dossier);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const feedValues = workbook.getWorksheet("Charah")!.getSheetValues().flat().map(String);
    expect(feedValues).toEqual(expect.arrayContaining(["Wanda · Animal feed & fodder", "Purani entry, durustgi mojood", "Durust ki hui entry", "1.5"]));
    const financeValues = workbook.getWorksheet("Maali khulasa")!.getSheetValues().flat().map(String);
    expect(financeValues).toEqual(expect.arrayContaining([
      "Kharid ki qeemat", "Sehat ka kharcha", "Janwar farokht ki aamdani", "Doodh ki andazati qeemat",
      "Feed ka kharcha dastiyab nahi", "975", "1000", "100", "2000", "Nahi",
    ]));
    expect(financeValues.filter((value) => value === "Janwar farokht ki aamdani")).toHaveLength(1);

    const pdfText = new TextDecoder().decode(await buildAnimalDossierPdf(dossier));
    expect(pdfText).toContain("/NotoSans");
    expect(pdfText).toContain("utm_campaign=animal-profile");
    expect(pdfText).toContain("mailto:contact@codingmoves.com");
  });

  it("sums daily milk in cents and marks total-only weeks as incomplete", async () => {
    const dossier = {
      ...input,
      milk: [
        { date: "2026-11-20", shift: "Morning", litres: 0.1 },
        { date: "2026-11-20", shift: "Evening", litres: 0.2 },
      ],
      milkShifts: [{ milk_date: "2026-11-20", mode: "total" as const }],
    };
    const bytes = await buildAnimalDossierWorkbook(dossier);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const profile = workbook.getWorksheet("Janwar ka record")!.getSheetValues().flat().map(String);
    expect(profile).toContain("2026-11-20 · 0.30 L");
    expect(profile).toContain("Saat din ka per-janwar doodh record mukammal nahi");
  });
});

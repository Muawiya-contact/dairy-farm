import type { Animal, AnimalCareTask, Calving, CalvingOffspring, HealthEvent, HealthEventAttachment, HerdAlert, Insemination, MilkShift } from "./farm-data";
import type { LoadedFarmSettings } from "./settings";
import { formatDay } from "./dates";
import { animalAge } from "./animal-life";
import { sevenDayMilkAverage, type AnimalProfileStatuses } from "./animal-profile";
import { breedingDueDate } from "./breeding-register";
import { sumMilkLitres } from "./milk-entry";

export type AnimalDossier = {
  animal: Animal;
  animals: Animal[];
  farm: LoadedFarmSettings;
  today: string;
  status: AnimalProfileStatuses;
  health: HealthEvent[];
  healthAttachments: HealthEventAttachment[];
  activeAlerts: HerdAlert[];
  inseminations: Insemination[];
  calvings: Calving[];
  offspring: CalvingOffspring[];
  milkShifts: Pick<MilkShift, "milk_date" | "mode">[];
  milk: { date: string; shift: string; litres: number }[];
  dueTasks: { date: string; label: string; overdue: boolean }[];
  careTasks: AnimalCareTask[];
  photoDataUrl?: string;
};

const num = (value: number | string | null | undefined) => value == null ? "" : Number(value);
const formatOptionalDay = (date: string | null | undefined) => date ? formatDay(date) : "Not recorded";
const animalName = (animal: Animal | undefined) => animal ? `${animal.tag}${animal.name ? ` · ${animal.name}` : ""}` : "Not recorded";

function dossierSheets(input: AnimalDossier) {
  const { animal, farm, status } = input;
  const recentMilkAverage = dossierMilkRecentAverage(input);
  const mother = input.animals.find((item) => item.id === animal.mother_id);
  const relatedBirth = input.offspring.find((item) => item.animal_id === animal.id);
  const birthCalving = relatedBirth ? input.calvings.find((item) => item.id === relatedBirth.calving_id) : undefined;
  const ownedCalvings = input.calvings.filter((item) => item.animal_id === animal.id);
  const sheet = (name: string, columns: string[], rows: Record<string, unknown>[], emptyMessage: string): { name: string; columns: string[]; rows: Record<string, unknown>[] } => ({ name, columns, rows: rows.length ? rows : [{ [columns[0]]: emptyMessage }] });
  const profile = [
    { field: "Farm", value: farm.farm_name }, { field: "Farm contact", value: farm.contact_phone || "Not recorded" },
    { field: "Generated", value: formatDay(input.today) }, { field: "Tag", value: animal.tag }, { field: "Name", value: animal.name || "Not recorded" },
    { field: "Species", value: animal.species }, { field: "Breed", value: animal.breed || "Not recorded" }, { field: "Sex", value: animal.sex },
    { field: "Category", value: animal.category }, { field: "Birth date", value: animal.birth_date || "Not recorded" },
    { field: "Age at report date", value: animalAge(animal, input.today) },
    { field: "Estimated age at arrival (months)", value: num(animal.estimated_age_months_at_arrival) }, { field: "Arrival date", value: animal.arrival_date || "Not recorded" },
    { field: "Source", value: animal.source }, { field: "Purchase date", value: animal.purchase_date || "Not recorded" },
    { field: "Purchase price (Rs)", value: num(animal.purchase_price) }, { field: "Seller / trader", value: animal.seller_name || "Not recorded" },
    { field: "Market / location", value: animal.purchase_location || "Not recorded" }, { field: "Mother", value: animalName(mother) },
    { field: "Sire", value: animal.sire || "Not recorded" }, { field: "Life status", value: status.life },
    { field: "Production status", value: status.production }, { field: "Breeding status", value: status.breeding },
    { field: "Health follow-up", value: status.health }, { field: "Latest health due", value: status.healthDueDate || "Not recorded" },
    { field: "Active production alerts", value: input.activeAlerts.filter((alert) => alert.alert_kind === "dry_off" || alert.alert_kind === "calving").map((alert) => alert.message).join("; ") || "No active production alerts" },
    { field: "Latest milk", value: input.milk.length ? (() => {
      const latestDate = input.milk.map((row) => row.date).sort().at(-1)!;
      const litres = sumMilkLitres(input.milk.filter((row) => row.date === latestDate).map((row) => Number(row.litres) || 0));
      return `${latestDate} · ${litres.toFixed(2)} L`;
    })() : "No milk record" },
    { field: "Latest health event", value: input.health.length ? (() => {
      const latest = [...input.health].sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
      return `${latest.event_date} · ${latest.title}`;
    })() : "No health record" },
    { field: "Current breeding cycle", value: input.inseminations.filter((record) => record.status === "pending" || record.status === "pregnant")
      .sort((a, b) => b.service_date.localeCompare(a.service_date)).map((record) => `${record.status} · ${record.service_date}`)[0] ?? "No open breeding cycle" },
    { field: "Seven-day milk average (L/day)", value: recentMilkAverage == null ? "Incomplete: total-only shift in last seven days" : Number(recentMilkAverage.toFixed(2)) },
    { field: "Upcoming due tasks", value: input.dueTasks.length ? input.dueTasks.map((task) => `${task.label}: ${task.date}${task.overdue ? " (overdue)" : ""}`).join("; ") : "No recorded due tasks" },
    { field: "Exit date", value: animal.exit_date || "Not recorded" }, { field: "Exit reason", value: animal.exit_reason || "Not recorded" },
    { field: "Sale price (Rs)", value: num(animal.sale_price) }, { field: "Notes", value: animal.notes || "Not recorded" },
    { field: "Photo included", value: input.photoDataUrl ? "Yes" : animal.photo_path ? "Unavailable at export time" : "No photo" },
  ];
  const milk = [...input.milk].sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift)).map((row) => ({ date: row.date, shift: row.shift, litres: num(row.litres) }));
  const breeding = [...input.inseminations].sort((a, b) => a.service_date.localeCompare(b.service_date)).map((record) => ({
    service_date: record.service_date, semen_type: record.semen_type, semen_name: record.semen_name || "", semen_batch: record.semen_batch || "",
    technician: record.technician || "", status: record.status, ultrasound_due: breedingDueDate(record, "ultrasound").date,
    ultrasound_due_type: breedingDueDate(record, "ultrasound").overridden ? "Manual" : "Calculated", ultrasound_date: record.ultrasound_date || "",
    ultrasound_result: record.ultrasound_result || "", checkup_due: breedingDueDate(record, "checkup").date,
    checkup_due_type: breedingDueDate(record, "checkup").overridden ? "Manual" : "Calculated", checkup_date: record.checkup_date || "",
    checkup_result: record.checkup_result || "", dry_off_due: breedingDueDate(record, "dry_off").date,
    dry_off_due_type: breedingDueDate(record, "dry_off").overridden ? "Manual" : "Calculated", dry_off_date: record.dry_off_date || "",
    calving_due: breedingDueDate(record, "calving").date,
    calving_due_type: breedingDueDate(record, "calving").overridden ? "Manual" : "Calculated",
    abortion_date: record.abortion_date || "", notes: record.notes || "",
  }));
  const healthRow = (event: HealthEvent) => ({
      date: event.event_date, kind: event.kind, title: event.title, medicine: event.medicine || "", veterinarian: event.vet || "",
      symptoms: event.symptoms || "", diagnosis: event.diagnosis || "", severity: event.severity || "",
      current_condition: event.current_condition || "", medicine_type: event.medicine_type || "", dosage: event.dosage || "",
      route: event.route || "", treatment_start_date: event.treatment_start_date || "", treatment_end_date: event.treatment_end_date || "",
      cost_rs: num(event.cost), next_due_date: event.next_due_date || "", notes: event.notes || "",
      attachments: input.healthAttachments.filter((attachment) => attachment.health_event_id === event.id).map((attachment) => attachment.file_name).join("; "),
    });
  const health = [...input.health].filter((event) => event.kind !== "vaccine" && event.kind !== "deworming")
    .sort((a, b) => a.event_date.localeCompare(b.event_date)).map(healthRow);
  const vaccines = [...input.health].filter((event) => event.kind === "vaccine" || event.kind === "deworming")
    .sort((a, b) => a.event_date.localeCompare(b.event_date)).map(healthRow);
  const calvingRows: Record<string, unknown>[] = [];
  if (birthCalving && relatedBirth) calvingRows.push({ date: birthCalving.calving_date, role: "Birth record", outcome: relatedBirth.outcome,
    birth_order: relatedBirth.birth_order, calf: animalName(animal), sex: relatedBirth.sex || "", weight_kg: num(relatedBirth.birth_weight_kg), notes: relatedBirth.notes || "" });
  for (const calving of ownedCalvings) {
    const children = input.offspring.filter((child) => child.calving_id === calving.id);
    if (children.length) {
      children.forEach((child) => calvingRows.push({ date: calving.calving_date, role: "Dam", outcome: child.outcome,
        birth_order: child.birth_order, calf: child.animal_id ? animalName(input.animals.find((item) => item.id === child.animal_id)) : child.tag_at_birth || "Not tagged",
        sex: child.sex || "", weight_kg: num(child.birth_weight_kg), notes: [calving.notes, child.notes].filter(Boolean).join(" · ") }));
    } else calvingRows.push({ date: calving.calving_date, role: "Dam", outcome: calving.outcome, birth_order: "",
      calf: calving.calf_id ? animalName(input.animals.find((item) => item.id === calving.calf_id)) : "", sex: "", weight_kg: "", notes: calving.notes || "" });
  }
  const weights = relatedBirth?.birth_weight_kg == null ? [] : [{ date: birthCalving?.calving_date ?? "", event: "Birth weight", weight_kg: num(relatedBirth.birth_weight_kg), source: "Calving record" }];
  const healthCostPaise = input.health.reduce((total, event) => total + Math.round(Number(event.cost || 0) * 100), 0);
  const healthCosts = healthCostPaise / 100;
  const careTasks = [...input.careTasks].sort((a, b) => (a.completed_date ?? "9999-12-31").localeCompare(b.completed_date ?? "9999-12-31") || a.due_date.localeCompare(b.due_date)).map((task) => ({
    title: task.title, category: task.category, due_date: task.due_date, notes: task.notes || "",
    status: task.completed_date ? "Completed" : "Active", completed_date: task.completed_date || "",
    completion_notes: task.completion_notes || "",
  }));
  const financial = [
    ...(animal.purchase_price == null ? [] : [{ date: animal.purchase_date || "", kind: "Purchase", detail: animal.seller_name || animal.purchase_location || "", amount_rs: num(animal.purchase_price) }]),
    ...(animal.sale_price == null ? [] : [{ date: animal.exit_date || "", kind: "Sale", detail: animal.exit_reason || "", amount_rs: num(animal.sale_price) }]),
    ...(healthCosts ? [{ date: "", kind: "Recorded health costs", detail: "Sum of health event costs", amount_rs: healthCosts }] : []),
  ];
  return [
    sheet("Profile", ["field", "value"], profile, "No profile data recorded."),
    sheet("Milk", ["date", "shift", "litres"], milk, "No milk records for this animal."),
    sheet("Breeding", ["service_date", "semen_type", "semen_name", "semen_batch", "technician", "status", "ultrasound_due", "ultrasound_due_type", "ultrasound_date", "ultrasound_result", "checkup_due", "checkup_due_type", "checkup_date", "checkup_result", "dry_off_due", "dry_off_due_type", "dry_off_date", "calving_due", "calving_due_type", "abortion_date", "notes"], breeding, "No breeding records for this animal."),
    sheet("Care reminders", ["title", "category", "due_date", "status", "completed_date", "notes", "completion_notes"], careTasks, "No care reminders for this animal."),
    sheet("Health", ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "cost_rs", "next_due_date", "attachments", "notes"], health, "No treatment or checkup records for this animal."),
    sheet("Vaccinations", ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "next_due_date", "cost_rs", "attachments", "notes"], vaccines, "No vaccination or deworming records for this animal."),
    sheet("Calving & offspring", ["date", "role", "outcome", "birth_order", "calf", "sex", "weight_kg", "notes"], calvingRows, "No calving or offspring records for this animal."),
    sheet("Weight", ["date", "event", "weight_kg", "source"], weights, "No weight history recorded for this animal."),
    sheet("Feed", ["date", "feed", "quantity", "unit", "notes"], [], "No feed history is recorded in the app."),
    sheet("Financial summary", ["date", "kind", "detail", "amount_rs"], financial, "No animal purchase, sale, or health costs recorded."),
  ];
}

export async function buildAnimalDossierWorkbook(input: AnimalDossier): Promise<Uint8Array<ArrayBuffer>> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.farm.farm_name;
  workbook.created = new Date(`${input.today}T12:00:00Z`);
  for (const section of dossierSheets(input)) {
    const worksheet = workbook.addWorksheet(section.name);
    worksheet.addRow(section.columns);
    for (const row of section.rows) worksheet.addRow(section.columns.map((column) => row[column] ?? ""));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF255E35" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    section.columns.forEach((column, index) => { worksheet.getColumn(index + 1).width = Math.min(40, Math.max(14, column.length + 3)); });
    if (section.name === "Profile" && input.photoDataUrl) {
      const extension = input.photoDataUrl.startsWith("data:image/png") ? "png" : "jpeg";
      const imageId = workbook.addImage({ base64: input.photoDataUrl, extension });
      worksheet.addImage(imageId, { tl: { col: 2, row: 0 }, ext: { width: 150, height: 150 } });
      worksheet.getColumn(3).width = 24;
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}

export async function buildAnimalDossierPdf(input: AnimalDossier): Promise<Uint8Array<ArrayBuffer>> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const animal = input.animal;
  const recentMilkAverage = dossierMilkRecentAverage(input);
  pdf.setProperties({ title: `${animal.tag} animal dossier`, subject: `Farm animal record for ${animal.tag}` });
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.text(input.farm.farm_name, margin, 17);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  const contact = [input.farm.owner_name, input.farm.contact_phone].filter(Boolean).join(" · ");
  if (contact) pdf.text(contact, margin, 23);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text("Animal dossier", margin, 34);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Generated ${formatDay(input.today)}`, margin, 40);
  let cursorY = 48;
  if (input.photoDataUrl) {
    try {
      const format = input.photoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      pdf.addImage(input.photoDataUrl, format, margin, cursorY, 30, 30, undefined, "FAST");
      cursorY += 35;
    } catch { /* A missing/unsupported image must not block the written dossier. */ }
  }
  const mother = input.animals.find((item) => item.id === animal.mother_id);
  const profile = [
    ["Tag / name", `${animal.tag}${animal.name ? ` · ${animal.name}` : ""}`],
    ["Species / breed", `${animal.species}${animal.breed ? ` · ${animal.breed}` : " · Not recorded"}`],
    ["Sex / category", `${animal.sex} · ${animal.category}`],
    ["Birth date / estimated age", `${formatOptionalDay(animal.birth_date)} · ${animal.estimated_age_months_at_arrival == null ? "Age not recorded" : `${animal.estimated_age_months_at_arrival} months at arrival`}`],
    ["Arrival / source", `${formatOptionalDay(animal.arrival_date)} · ${animal.source}`],
    ["Purchase", [formatOptionalDay(animal.purchase_date), animal.purchase_price == null ? "Price not recorded" : `Rs ${num(animal.purchase_price)}`, animal.seller_name, animal.purchase_location].filter(Boolean).join(" · ")],
    ["Mother / sire", `${animalName(mother)} · ${animal.sire || "Sire not recorded"}`],
    ["Life / production", `${input.status.life} · ${input.status.production}`],
    ["Breeding / health follow-up", `${input.status.breeding} · ${input.status.health}${input.status.healthDueDate ? ` (${formatDay(input.status.healthDueDate)})` : ""}`],
    ["Active production alerts", input.activeAlerts.filter((alert) => alert.alert_kind === "dry_off" || alert.alert_kind === "calving").map((alert) => alert.message).join("; ") || "No active production alerts"],
    ["Latest milk", input.milk.length ? (() => {
      const latestDate = input.milk.map((row) => row.date).sort().at(-1)!;
      const litres = sumMilkLitres(input.milk.filter((row) => row.date === latestDate).map((row) => Number(row.litres) || 0));
      return `${formatDay(latestDate)} · ${litres.toFixed(2)} L`;
    })() : "No milk record"],
    ["Latest health event", input.health.length ? (() => {
      const latest = [...input.health].sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
      return `${formatDay(latest.event_date)} · ${latest.title}`;
    })() : "No health record"],
    ["Current breeding cycle", input.inseminations.filter((record) => record.status === "pending" || record.status === "pregnant")
      .sort((a, b) => b.service_date.localeCompare(a.service_date)).map((record) => `${record.status} · ${formatDay(record.service_date)}`)[0] ?? "No open breeding cycle"],
    ["Seven-day milk average", recentMilkAverage == null ? "Incomplete: total-only shift in last seven days" : `${recentMilkAverage.toFixed(2)} L/day`],
    ["Due tasks", input.dueTasks.map((task) => `${task.label}: ${formatDay(task.date)}${task.overdue ? " (overdue)" : ""}`).join("; ") || "No recorded due tasks"],
  ];
  const profileTable = (pdf as typeof pdf & { lastAutoTable?: { finalY?: number } });
  autoTable(pdf, { startY: cursorY, margin: { left: margin, right: margin, bottom: 17 }, head: [["Profile", "Recorded value"]], body: profile,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, overflow: "linebreak" }, headStyles: { fillColor: [37, 94, 53] },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: pageWidth - 2 * margin - 45 } } });
  cursorY = (profileTable.lastAutoTable?.finalY ?? cursorY) + 8;

  const addTable = (title: string, columns: string[], rows: Record<string, unknown>[]) => {
    if (cursorY > 250) { pdf.addPage(); cursorY = 18; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text(title, margin, cursorY);
    const table = pdf as typeof pdf & { lastAutoTable?: { finalY?: number } };
    autoTable(pdf, { startY: cursorY + 3, margin: { left: margin, right: margin, bottom: 17 },
      head: [columns.map((column) => column.replaceAll("_", " "))],
      body: rows.length ? rows.map((row) => columns.map((column) => {
        const value = row[column];
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
        return value == null ? "" : String(value);
      })) : [[`No ${title.toLowerCase()} recorded for this animal.`, ...columns.slice(1).map(() => "")]],
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.8, overflow: "linebreak" }, headStyles: { fillColor: [37, 94, 53] },
      horizontalPageBreak: true, horizontalPageBreakRepeat: [0],
    });
    cursorY = (table.lastAutoTable?.finalY ?? cursorY) + 8;
  };
  const sheets = dossierSheets(input);
  const tableFor = (name: string) => sheets.find((section) => section.name === name)!;
  const pdfColumns: Record<string, string[]> = {
    Milk: ["date", "shift", "litres"],
    Breeding: ["service_date", "semen_name", "technician", "status", "ultrasound_due", "ultrasound_due_type", "ultrasound_date", "checkup_due", "checkup_due_type", "checkup_date", "dry_off_due", "dry_off_due_type", "dry_off_date", "calving_due", "calving_due_type", "notes"],
    "Care reminders": ["title", "category", "due_date", "status", "completed_date", "notes", "completion_notes"],
    Health: ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "next_due_date", "attachments", "cost_rs", "notes"],
    Vaccinations: ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "next_due_date", "attachments", "cost_rs", "notes"],
    "Calving & offspring": ["date", "role", "outcome", "calf", "sex", "weight_kg", "notes"],
    Weight: ["date", "event", "weight_kg", "source"],
    Feed: ["date", "feed", "quantity", "unit", "notes"],
    "Financial summary": ["date", "kind", "detail", "amount_rs"],
  };
  for (const name of ["Milk", "Breeding", "Care reminders", "Health", "Vaccinations", "Calving & offspring", "Weight", "Feed", "Financial summary"]) {
    const section = tableFor(name);
    addTable(name, pdfColumns[name], section.rows);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(90, 100, 93);
    pdf.text(`${input.farm.farm_name} · ${animal.tag}`, margin, 289);
    pdf.text(`${page}/${pages}`, pageWidth - margin, 289, { align: "right" });
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

export function safeAnimalFilename(animal: Pick<Animal, "tag">, extension: "pdf" | "xlsx"): string {
  const tag = animal.tag.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "animal";
  return `animal-${tag}.${extension}`;
}

export function dossierMilkRecentAverage(input: AnimalDossier): number | null {
  const milkByDate = new Map<string, number[]>();
  for (const row of input.milk) {
    milkByDate.set(row.date, [...(milkByDate.get(row.date) ?? []), Number(row.litres) || 0]);
  }
  const dailyMilk = [...milkByDate].map(([date, amounts]) => ({ date, litres: sumMilkLitres(amounts) }));
  return sevenDayMilkAverage(dailyMilk, input.today, input.milkShifts);
}

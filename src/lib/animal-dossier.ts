import type { Animal, AnimalCareTask, AnimalFeedRecord, AnimalIncomeEntry, AnimalMilk, AnimalWeightRecord, Calving, CalvingOffspring, HealthEvent, HealthEventAttachment, HerdAlert, Insemination, MilkShift } from "./farm-data";
import type { LoadedFarmSettings } from "./settings";
import { formatDay } from "./dates";
import { animalAge } from "./animal-life";
import { latestHealthEvent, sevenDayMilkAverage, type AnimalProfileStatuses } from "./animal-profile";
import { breedingDueDate } from "./breeding-register";
import { sumMilkLitres } from "./milk-entry";
import { loadPdfDeveloperLogo, loadPdfDeveloperQr, loadPdfLogo, pdfTrackingUrl } from "./pdf-brand";
import { installPdfFonts } from "./pdf/fonts";
import { CODING_MOVES_CONTACT_EMAIL, CODING_MOVES_CONTACT_URL, CODING_MOVES_DEVELOPER_CREDIT, CODING_MOVES_DISPLAY_URL } from "./coding-moves";
import { animalWeightChange, animalWeightHistory } from "./animal-weight-history";
import { animalFinancialSummary } from "./animal-finance";

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
  animalWeights: AnimalWeightRecord[];
  animalFeed: AnimalFeedRecord[];
  animalIncome: AnimalIncomeEntry[];
  milkShifts: Pick<MilkShift, "milk_date" | "mode">[];
  milk: { date: string; shift: string; litres: number }[];
  dueTasks: { date: string; label: string; overdue: boolean }[];
  careTasks: AnimalCareTask[];
  photoDataUrl?: string;
};

const num = (value: number | string | null | undefined) => value == null ? "" : Number(value);
const formatOptionalDay = (date: string | null | undefined) => date ? formatDay(date) : "Darj nahi";
const animalName = (animal: Animal | undefined) => animal ? `${animal.tag}${animal.name ? ` · ${animal.name}` : ""}` : "Darj nahi";

const sheetNames: Record<string, string> = {
  Profile: "Janwar ka record", Milk: "Doodh", Breeding: "Nasl kashi", "Care reminders": "Janwar ke follow-up",
  Health: "Sehat ka record", Vaccinations: "Teekay aur deworming", "Calving & offspring": "Paidaish aur bachay",
  Weight: "Wazan", Feed: "Charah", "Financial summary": "Maali khulasa",
};
const fieldNames: Record<string, string> = {
  Farm: "Farm ka naam", "Farm contact": "Rabtay ka number", Generated: "Report banayi", Tag: "Tag", Name: "Naam",
  Species: "Janwar ki qism", Breed: "Nasl", Sex: "Jins", Category: "Umar ka group", "Birth date": "Paidaish ki tareekh",
  "Age at report date": "Report ke din umar", "Estimated age at arrival (months)": "Aane ke waqt taqreebi umar (maheene)",
  "Arrival date": "Farm mein aane ki tareekh", Source: "Aane ka zariya", "Purchase date": "Kharid ki tareekh",
  "Purchase price (Rs)": "Kharid qeemat (Rs)", "Seller / trader": "Bechne wala", "Market / location": "Mandi / jagah",
  Mother: "Maa", Sire: "Baap / semen", "Life status": "Farm mein haisiyat", "Production status": "Doodh ki haisiyat",
  "Breeding status": "Nasl kashi ki haisiyat", "Health follow-up": "Sehat ka agla follow-up", "Latest health due": "Sehat ki agli tareekh",
  "Active production alerts": "Qareebi production reminders", "Latest milk": "Aakhri doodh", "Latest health event": "Aakhri sehat entry",
  "Current breeding cycle": "Maujooda nasl kashi", "Seven-day milk average (L/day)": "Saat din ka doodh ausat (L/roz)",
  "Upcoming due tasks": "Agley due kaam", "Exit date": "Farm se nikasi ki tareekh", "Exit reason": "Farm se nikasi ki wajah",
  "Sale price (Rs)": "Farokht qeemat (Rs)", Notes: "Mazeed maloomat", "Photo included": "Tasveer shamil",
};
const columnNames: Record<string, string> = {
  field: "Maloomat", value: "Darj shuda", date: "Tareekh", shift: "Shift ka waqt", litres: "Litre",
  service_date: "Service ki tareekh", semen_type: "Semen ki qism", semen_name: "Semen ka naam", semen_batch: "Semen lot",
  technician: "Vet ka naam", status: "Haalat", ultrasound_due: "Ultrasound ki due tareekh", ultrasound_due_type: "Tareekh ka zariya",
  ultrasound_date: "Ultrasound ki tareekh", ultrasound_result: "Natija", checkup_due: "Check-up ki due tareekh",
  checkup_due_type: "Tareekh ka zariya", checkup_date: "Check-up ki tareekh", checkup_result: "Natija",
  dry_off_due: "Doodh band karne ki due tareekh", dry_off_due_type: "Tareekh ka zariya", dry_off_date: "Doodh band karne ki tareekh",
  calving_due: "Paidaish ki mutawaqqa tareekh", calving_due_type: "Tareekh ka zariya", abortion_date: "Hamla zaya hone ki tareekh",
  title: "Naam", category: "Qism", due_date: "Due tareekh", completed_date: "Mukammal tareekh", notes: "Mazeed maloomat",
  completion_notes: "Mukammal karne ka note", kind: "Qism", symptoms: "Nishaniyan", diagnosis: "Vet ki tashkhees",
  severity: "Shiddat", current_condition: "Maujooda haalat", medicine: "Dawai", medicine_type: "Dawai ki qism", dosage: "Dose",
  route: "Dene ka tareeqa", treatment_start_date: "Ilaj shuru", treatment_end_date: "Ilaj khatam", veterinarian: "Vet",
  cost_rs: "Kharcha (Rs)", next_due_date: "Agli due tareekh", attachments: "File links", role: "Rishtah", outcome: "Nateeja",
  birth_order: "Paidaish ka number", calf: "Bacha", sex: "Jins", weight_kg: "Wazan (kg)", event: "Record", source: "Zariya",
  feed: "Charah", quantity: "Miqdar", unit: "Miqdar ki unit", detail: "Tafseel", amount_rs: "Raqam (Rs)",
  category_name: "Feed category", stock_quantity: "Stock unit mein miqdar", stock_unit: "Stock unit", record_status: "Record ki haisiyat",
  treatment: "Maali haisaab", included_in_recorded_total: "Recorded total mein shamil",
};
const enumNames: Record<string, Record<string, string>> = {
  species: { cow: "Gaye", buffalo: "Bhains" }, sex: { female: "Mada", male: "Nar" },
  category: { cow: "Bari gaye", heifer: "Bachhi", calf: "Bacha", bull: "Saand", buffalo: "Bhains", vaccination: "Teeka", vaccine: "Teeka", deworming: "Deworming", heat: "Garmi", medicine: "Dawai", checkup: "Check-up", custom: "Doosra" },
  source: { born: "Farm par paida hua", purchased: "Kharida", gift: "Tohfa", transfer: "Tabadla", other: "Doosra", "Calving record": "Paidaish ka record" },
  status: { active: "Chalu", sold: "Farokht", dead: "Wafat", removed: "Farm se nikala", pending: "Nateeja baqi", pregnant: "Gaabhan", empty: "Khuli", aborted: "Hamla zaya", calved: "Bachha de chuki", open: "Khuli", inseminated: "Nateeja baqi", fresh: "Nayi bachhi", na: "Laagu nahi", unknown: "Darj nahi", scheduled: "Muqarrar", overdue: "Due tareekh guzar gayi", completed: "Mukammal", Active: "Jari", Completed: "Mukammal" },
  production: { milking: "Doodh de rahi hai", dry: "Doodh band hai", none: "Doodh nahi de rahi" },
  breeding: { open: "Khuli", pregnant: "Gaabhan", pending: "Nateeja baqi", empty: "Khuli", aborted: "Hamla zaya", calved: "Bachha de chuki" },
  kind: {
    vaccine: "Teeka", treatment: "Ilaj", deworming: "Deworming", checkup: "Vet check-up", other: "Doosra",
    Purchase: "Kharid", Sale: "Farokht", "Recorded health costs": "Darj sehat ka kharcha",
    "Purchase price": "Kharid ki qeemat", "Medical expense": "Sehat ka kharcha",
    "Health cost (unlinked)": "Sehat ka ghair-mansub kharcha", "Animal sale proceeds": "Janwar farokht ki aamdani",
    "Manure income": "Gobar ki aamdani", "Other linked income": "Juri hui aamdani", "Linked income": "Juri hui aamdani",
    "Milk production value estimate": "Doodh ki andazati qeemat", "Milk value estimate unavailable": "Doodh ki andazati qeemat dastiyab nahi",
    "Feed cost unavailable": "Feed ka kharcha dastiyab nahi", "Medical cost data incomplete": "Sehat kharchay ka record na-mukammal",
    "Sale ledger transaction unavailable": "Farokht ki ledger entry dastiyab nahi",
  },
  treatment: { "recorded cost": "Darj kharcha", "recorded revenue": "Darj aamdani", "estimate only": "Sirf taqmeena", "excluded / unavailable": "Shamil nahi / dastiyab nahi" },
  included_in_recorded_total: { Yes: "Haan", No: "Nahi" },
  severity: { mild: "Halki", moderate: "Darmiyani", severe: "Zyada" },
  role: { Dam: "Maa", "Birth record": "Paidaish ka record" },
  outcome: { alive: "Zinda", dead: "Murdah", twins: "Joray", normal: "Mamool ke mutabiq", stillborn: "Murdah paida" },
  semen_type: { normal: "Mamooli", sexed: "Jins ke mutabiq", bull: "Saand" },
  due: { Manual: "Khud darj", Calculated: "Hisab se" },
};
const plainValues: Record<string, string> = {
  "Not recorded": "Darj nahi", "No profile data recorded.": "Janwar ki maloomat darj nahi.",
  "No milk records for this animal.": "Is janwar ka doodh record nahi.", "No breeding records for this animal.": "Is janwar ka nasl kashi record nahi.",
  "No care reminders for this animal.": "Is janwar ka follow-up record nahi.", "No treatment or checkup records for this animal.": "Ilaj ya vet check-up ka record nahi.",
  "No vaccination or deworming records for this animal.": "Teekay ya deworming ka record nahi.", "No calving or offspring records for this animal.": "Paidaish ya bachon ka record nahi.",
  "No weight history recorded for this animal.": "Is janwar ka wazan record nahi.", "No feed history is recorded in the app.": "App mein charah dene ka record nahi.",
  "No animal purchase, sale, or health costs recorded.": "Kharid, farokht ya sehat ke kharchay ka record nahi.",
  "Current entry": "Maujooda entry", Correction: "Durust ki hui entry", Superseded: "Purani entry, durustgi mojood",
  "No active production alerts": "Koi qareebi production reminder nahi.", "No milk record": "Doodh ka record nahi", "No health record": "Sehat ka record nahi",
  "No open breeding cycle": "Nasl kashi ka khula record nahi", "Incomplete: total-only shift in last seven days": "Saat din ka per-janwar doodh record mukammal nahi",
  "No recorded due tasks": "Koi due kaam darj nahi", "No photo": "Tasveer nahi", "Unavailable at export time": "Export ke waqt tasveer dastiyab nahi thi",
  "Age not recorded": "Umar darj nahi", "Price not recorded": "Qeemat darj nahi", "Sire not recorded": "Baap / semen darj nahi",
  "No tagged": "Tag darj nahi", "Not tagged": "Tag darj nahi", "Sum of health event costs": "Sehat ke record ka kul kharcha",
  "Birth weight": "Paidaish ka wazan", "Tag / name": "Tag / naam", "Species / breed": "Janwar ki qism / nasl", "Sex / category": "Jins / umar ka group",
  "Birth date / estimated age": "Paidaish / taqreebi umar", "Arrival / source": "Farm mein aane ki tareekh / zariya",
  Purchase: "Kharid", "Mother / sire": "Maa / baap", "Life / production": "Farm / doodh ki haisiyat",
  "Breeding / health follow-up": "Nasl kashi / sehat follow-up", "Latest milk": "Aakhri doodh", "Latest health event": "Aakhri sehat entry",
  "Current breeding cycle": "Maujooda nasl kashi", "Seven-day milk average": "Saat din ka doodh ausat", "Due tasks": "Due kaam",
  "Active production alerts": "Qareebi production reminders", Profile: "Janwar ka record", "Recorded value": "Darj shuda maloomat",
  Generated: "Report banayi", "Animal dossier": "Janwar ka mukammal record",
};

const localizeEnum = (column: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const enumColumn = column.endsWith("_due_type") ? "due" : column;
  return enumNames[enumColumn]?.[value] ?? plainValues[value] ?? value;
};
const localizeProfileValue = (field: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const column = ({ Species: "species", Sex: "sex", Category: "category", Source: "source", "Life status": "status",
    "Production status": "production", "Breeding status": "breeding", "Health follow-up": "health_status", "Current breeding cycle": "breeding" } as Record<string, string>)[field];
  if (column) {
    if (field === "Health follow-up") return ({ overdue: "Due tareekh guzar gayi", scheduled: "Follow-up darj hai", "no-follow-up": "Agli tareekh darj nahi", "no-record": "Sehat ka record nahi" } as Record<string, string>)[value] ?? value;
    if (field === "Current breeding cycle") return plainValues[value] ?? value.split(" · ").map((part, index) => index === 0 ? (enumNames.breeding[part] ?? part) : part).join(" · ");
    return enumNames[column]?.[value] ?? value;
  }
  return plainValues[value] ?? value;
};
const localizeColumn = (column: string) => columnNames[column] ?? column.replaceAll("_", " ");
const localizeProfileField = (field: string) => fieldNames[field] ?? field;

function dossierSheets(input: AnimalDossier) {
  const { animal, farm, status } = input;
  const recentMilkAverage = dossierMilkRecentAverage(input);
  const mother = input.animals.find((item) => item.id === animal.mother_id);
  const relatedBirth = input.offspring.find((item) => item.animal_id === animal.id);
  const birthCalving = relatedBirth ? input.calvings.find((item) => item.id === relatedBirth.calving_id) : undefined;
  const weightHistory = animalWeightHistory(input.animalWeights, relatedBirth?.birth_weight_kg != null && birthCalving
    ? { date: birthCalving.calving_date, weight_kg: Number(relatedBirth.birth_weight_kg) } : null);
  const weightSummary = animalWeightChange(weightHistory);
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
    { field: "Latest weight", value: weightSummary.latest ? `${weightSummary.latest.weight_date} · ${weightSummary.latest.weight_kg.toFixed(2)} kg` : "No weight history" },
    { field: "Previous weight", value: weightSummary.previous ? `${weightSummary.previous.weight_date} · ${weightSummary.previous.weight_kg.toFixed(2)} kg` : "No previous weight" },
    { field: "Weight change", value: weightSummary.change_kg == null ? "Not calculated" : `${weightSummary.change_kg > 0 ? "+" : ""}${weightSummary.change_kg.toFixed(2)} kg` },
    { field: "Latest health event", value: input.health.length ? (() => {
      const latest = latestHealthEvent(input.health)!;
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
  const weights = weightHistory.map((row) => ({ date: row.weight_date,
    event: row.source === "birth" ? "Paidaish par wazan" : "Wazan ki entry", weight_kg: num(row.weight_kg),
    source: row.source === "birth" ? "Paidaish ka record" : "Farm ki entry", notes: row.notes || "" }));
  const feedRows = input.animalFeed.map((entry) => ({ date: entry.feed_date,
    feed: `${entry.item_name} · ${entry.category_name}`, quantity: num(entry.quantity), unit: entry.unit,
    stock_quantity: num(entry.stock_quantity), stock_unit: entry.stock_unit, notes: entry.note || "",
    record_status: entry.superseded_by ? "Superseded" : entry.supersedes_id ? "Correction" : "Current entry" }));
  const financialMilk: AnimalMilk[] = input.milk.map((row, index) => ({
    id: `dossier-milk-${index}`, animal_id: animal.id, shift_id: `dossier-shift-${row.date}-${index}`, litres: row.litres,
  }));
  const finance = animalFinancialSummary({ animal, health: input.health, income: input.animalIncome, milk: financialMilk,
    feed: input.animalFeed, currentMilkRate: farm.default_milk_rate });
  const financial = finance.lines.map((line) => ({ date: line.date, kind: line.kind, detail: line.detail,
    amount_rs: line.amount_rs, treatment: line.treatment, included_in_recorded_total: line.included_in_recorded_total ? "Yes" : "No" }));
  const careTasks = [...input.careTasks].sort((a, b) => (a.completed_date ?? "9999-12-31").localeCompare(b.completed_date ?? "9999-12-31") || a.due_date.localeCompare(b.due_date)).map((task) => ({
    title: task.title, category: task.category, due_date: task.due_date, notes: task.notes || "",
    status: task.completed_date ? "Completed" : "Active", completed_date: task.completed_date || "",
    completion_notes: task.completion_notes || "",
  }));
  return [
    sheet("Profile", ["field", "value"], profile, "No profile data recorded."),
    sheet("Milk", ["date", "shift", "litres"], milk, "No milk records for this animal."),
    sheet("Breeding", ["service_date", "semen_type", "semen_name", "semen_batch", "technician", "status", "ultrasound_due", "ultrasound_due_type", "ultrasound_date", "ultrasound_result", "checkup_due", "checkup_due_type", "checkup_date", "checkup_result", "dry_off_due", "dry_off_due_type", "dry_off_date", "calving_due", "calving_due_type", "abortion_date", "notes"], breeding, "No breeding records for this animal."),
    sheet("Care reminders", ["title", "category", "due_date", "status", "completed_date", "notes", "completion_notes"], careTasks, "No care reminders for this animal."),
    sheet("Health", ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "cost_rs", "next_due_date", "attachments", "notes"], health, "No treatment or checkup records for this animal."),
    sheet("Vaccinations", ["date", "kind", "title", "symptoms", "diagnosis", "severity", "current_condition", "medicine", "medicine_type", "dosage", "route", "treatment_start_date", "treatment_end_date", "veterinarian", "next_due_date", "cost_rs", "attachments", "notes"], vaccines, "No vaccination or deworming records for this animal."),
    sheet("Calving & offspring", ["date", "role", "outcome", "birth_order", "calf", "sex", "weight_kg", "notes"], calvingRows, "No calving or offspring records for this animal."),
    sheet("Weight", ["date", "event", "weight_kg", "source", "notes"], weights, "No weight history recorded for this animal."),
    sheet("Feed", ["date", "feed", "quantity", "unit", "stock_quantity", "stock_unit", "record_status", "notes"], feedRows, "No feed history is recorded in the app."),
    sheet("Financial summary", ["date", "kind", "detail", "amount_rs", "treatment", "included_in_recorded_total"], financial, "No animal purchase, sale, or health costs recorded."),
  ];
}

export async function buildAnimalDossierWorkbook(input: AnimalDossier): Promise<Uint8Array<ArrayBuffer>> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.farm.farm_name;
  workbook.created = new Date(`${input.today}T12:00:00Z`);
  for (const section of dossierSheets(input)) {
    const worksheet = workbook.addWorksheet(sheetNames[section.name] ?? section.name);
    worksheet.addRow(section.columns.map(localizeColumn));
    for (const row of section.rows) worksheet.addRow(section.columns.map((column) => {
      const value = row[column];
      if (section.name === "Profile" && column === "field") return localizeProfileField(String(value ?? ""));
      if (section.name === "Profile" && column === "value") return localizeProfileValue(String(row.field ?? ""), value);
      return localizeEnum(column.replace(/_(?:due|date|result)$/, ""), value) ?? "";
    }));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF255E35" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    section.columns.forEach((column, index) => { worksheet.getColumn(index + 1).width = Math.min(40, Math.max(14, localizeColumn(column).length + 3)); });
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
  const trackingUrl = pdfTrackingUrl("animal-profile");
  const [, logo, developerLogo, developerQr] = await Promise.all([
    installPdfFonts(pdf), loadPdfLogo(), loadPdfDeveloperLogo(), loadPdfDeveloperQr(trackingUrl),
  ]);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const animal = input.animal;
  const recentMilkAverage = dossierMilkRecentAverage(input);
  pdf.setProperties({ title: `${animal.tag} janwar ka record`, subject: `${animal.tag} ka farm record` });
  pdf.addImage(logo, "PNG", margin, 10, 12, 12);
  pdf.setFont("BricolageGrotesque", "extrabold"); pdf.setTextColor(23, 41, 28); pdf.setFontSize(17); pdf.text(input.farm.farm_name, margin + 16, 17);
  pdf.setFont("NotoSans", "normal"); pdf.setTextColor(87, 99, 91); pdf.setFontSize(8);
  const contact = [input.farm.owner_name, input.farm.contact_phone].filter(Boolean).join(" · ");
  if (contact) pdf.text(`Maalik: ${contact}`, margin + 16, 22);
  pdf.setFont("NotoSans", "bold"); pdf.setTextColor(29, 70, 38); pdf.setFontSize(11); pdf.text("Janwar ka mukammal record", pageWidth - margin, 16, { align: "right" });
  pdf.setFont("NotoSans", "normal"); pdf.setTextColor(50, 62, 53); pdf.setFontSize(7.5); pdf.text(`Report banayi: ${formatDay(input.today)}`, pageWidth - margin, 21, { align: "right" });
  pdf.setDrawColor(29, 70, 38); pdf.setLineWidth(0.7); pdf.line(margin, 28, pageWidth - margin, 28);
  let cursorY = 37;
  if (input.photoDataUrl) {
    try {
      const format = input.photoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      pdf.addImage(input.photoDataUrl, format, margin, cursorY, 30, 30, undefined, "FAST");
      cursorY += 35;
    } catch { /* A missing/unsupported image must not block the written dossier. */ }
  }
  const mother = input.animals.find((item) => item.id === animal.mother_id);
  const profile = [
    ["Tag / naam", `${animal.tag}${animal.name ? ` · ${animal.name}` : ""}`],
    ["Janwar ki qism / nasl", `${localizeEnum("species", animal.species)}${animal.breed ? ` · ${animal.breed}` : " · Darj nahi"}`],
    ["Jins / umar ka group", `${localizeEnum("sex", animal.sex)} · ${localizeEnum("category", animal.category)}`],
    ["Paidaish / aane par umar", `${formatOptionalDay(animal.birth_date)} · ${animal.estimated_age_months_at_arrival == null ? "Umar darj nahi" : `${animal.estimated_age_months_at_arrival} maheene farm aane par`}`],
    ["Farm mein aane ki tareekh / zariya", `${formatOptionalDay(animal.arrival_date)} · ${localizeEnum("source", animal.source)}`],
    ["Kharid", [formatOptionalDay(animal.purchase_date), animal.purchase_price == null ? "Qeemat darj nahi" : `Rs ${num(animal.purchase_price)}`, animal.seller_name, animal.purchase_location].filter(Boolean).join(" · ")],
    ["Maa / baap", `${animalName(mother)} · ${animal.sire || "Baap / semen darj nahi"}`],
    ["Farm / doodh ki haisiyat", `${localizeProfileValue("Life status", input.status.life)} · ${localizeProfileValue("Production status", input.status.production)}`],
    ["Nasl kashi / sehat follow-up", `${localizeProfileValue("Breeding status", input.status.breeding)} · ${localizeProfileValue("Health follow-up", input.status.health)}${input.status.healthDueDate ? ` (${formatDay(input.status.healthDueDate)})` : ""}`],
    ["Aane wale aham reminders", input.activeAlerts.filter((alert) => alert.alert_kind === "dry_off" || alert.alert_kind === "calving").map((alert) => alert.message).join("; ") || "Koi qareebi production reminder nahi."],
    ["Aakhri doodh", input.milk.length ? (() => {
      const latestDate = input.milk.map((row) => row.date).sort().at(-1)!;
      const litres = sumMilkLitres(input.milk.filter((row) => row.date === latestDate).map((row) => Number(row.litres) || 0));
      return `${formatDay(latestDate)} · ${litres.toFixed(2)} L`;
    })() : "Doodh ka record nahi"],
    ["Aakhri sehat entry", input.health.length ? (() => {
      const latest = latestHealthEvent(input.health)!;
      return `${formatDay(latest.event_date)} · ${latest.title}`;
    })() : "Sehat ka record nahi"],
    ["Maujooda nasl kashi", input.inseminations.filter((record) => record.status === "pending" || record.status === "pregnant")
      .sort((a, b) => b.service_date.localeCompare(a.service_date)).map((record) => `${localizeEnum("breeding", record.status)} · ${formatDay(record.service_date)}`)[0] ?? "Nasl kashi ka khula record nahi"],
    ["Saat din ka doodh ausat", recentMilkAverage == null ? "Saat din ka per-janwar doodh record mukammal nahi" : `${recentMilkAverage.toFixed(2)} L/roz`],
    ["Agley due kaam", input.dueTasks.map((task) => `${task.label}: ${formatDay(task.date)}${task.overdue ? " (due tareekh guzar gayi)" : ""}`).join("; ") || "Koi due kaam darj nahi"],
  ];
  const profileTable = (pdf as typeof pdf & { lastAutoTable?: { finalY?: number } });
  autoTable(pdf, { startY: cursorY, margin: { left: margin, right: margin, bottom: 17 }, head: [["Janwar ka record", "Darj shuda maloomat"]], body: profile,
    styles: { font: "NotoSans", fontSize: 8, cellPadding: 2.2, overflow: "linebreak" }, headStyles: { fillColor: [230, 238, 231], textColor: [29, 70, 38], font: "NotoSans", fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: pageWidth - 2 * margin - 45 } } });
  cursorY = (profileTable.lastAutoTable?.finalY ?? cursorY) + 8;

  const addTable = (title: string, columns: string[], rows: Record<string, unknown>[]) => {
    if (cursorY > 250) { pdf.addPage(); cursorY = 18; }
    const visibleTitle = sheetNames[title] ?? title;
    pdf.setFont("NotoSans", "bold"); pdf.setFontSize(11); pdf.setTextColor(29, 70, 38); pdf.text(visibleTitle, margin, cursorY);
    const table = pdf as typeof pdf & { lastAutoTable?: { finalY?: number } };
    autoTable(pdf, { startY: cursorY + 3, margin: { left: margin, right: margin, bottom: 17 },
      head: [columns.map(localizeColumn)],
      body: rows.length ? rows.map((row) => columns.map((column) => {
        const value = row[column];
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
        return value == null ? "" : String(localizeEnum(column.replace(/_(?:due|date|result)$/, ""), value));
      })) : [["Is hissay ka record darj nahi.", ...columns.slice(1).map(() => "")]],
      styles: { font: "NotoSans", fontSize: 7.5, cellPadding: 1.8, overflow: "linebreak" }, headStyles: { fillColor: [230, 238, 231], textColor: [29, 70, 38], font: "NotoSans", fontStyle: "bold" },
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
    Weight: ["date", "event", "weight_kg", "source", "notes"],
    Feed: ["date", "feed", "quantity", "unit", "stock_quantity", "stock_unit", "record_status", "notes"],
    "Financial summary": ["date", "kind", "detail", "amount_rs", "treatment", "included_in_recorded_total"],
  };
  for (const name of ["Milk", "Breeding", "Care reminders", "Health", "Vaccinations", "Calving & offspring", "Weight", "Feed", "Financial summary"]) {
    const section = tableFor(name);
    addTable(name, pdfColumns[name], section.rows);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(222, 227, 220); pdf.setLineWidth(0.25); pdf.line(margin, 270, pageWidth - margin, 270);
    pdf.setFont("NotoSans", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(83, 95, 86);
    pdf.text(`${input.farm.farm_name} · ${animal.tag}`, margin, 276); pdf.text(`Page ${page} / ${pages}`, margin, 281);
    pdf.addImage(developerLogo, "PNG", pageWidth - margin - 72, 271, 8, 8);
    pdf.setFont("NotoSans", "bold"); pdf.setTextColor(31, 42, 34); pdf.setFontSize(6.8);
    pdf.text(CODING_MOVES_DEVELOPER_CREDIT, pageWidth - margin - 62, 275);
    pdf.setFont("NotoSans", "normal"); pdf.setFontSize(5.8); pdf.setTextColor(75, 86, 77);
    pdf.textWithLink(CODING_MOVES_DISPLAY_URL, pageWidth - margin - 62, 280, { url: trackingUrl });
    pdf.textWithLink(CODING_MOVES_CONTACT_EMAIL, pageWidth - margin - 62, 284, { url: CODING_MOVES_CONTACT_URL });
    pdf.addImage(developerQr, "PNG", pageWidth - margin - 12, 271, 12, 12); pdf.link(pageWidth - margin - 72, 270, 72, 14, { url: trackingUrl });
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

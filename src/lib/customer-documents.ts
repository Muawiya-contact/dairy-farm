import type { FarmData, Customer, CustomerReport, Payment } from "./farm-data";
import type { FarmSettings } from "./settings";
import { formatDay, formatMonth } from "./dates";
import { downloadBlob } from "./export-data";
import { installCustomerPdfFont } from "./customer-pdf-font";
import { loadPdfLogo } from "./pdf-brand";

export type StatementLine = {
  id: string; date: string; detail: string; litres: number | null; charge: number; credit: number;
};

const numeric = (value: number | string | null | undefined) => Number(value ?? 0);
const decimal = (value: number) => Math.abs(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pdfMoney = (value: number) => `${value < 0 ? "-" : ""}${decimal(value)}`;
const textMoney = (value: number) => `${value < 0 ? "-" : ""}Rs ${decimal(value)}`;

/** The detail lines come from saved Supabase records; totals remain authoritative in the SQL report. */
export function statementLines(data: Pick<FarmData, "deliveries" | "companyBills" | "payments">, customerId: string, month: string): StatementLine[] {
  const within = (date: string) => date.slice(0, 7) === month;
  return [
    ...data.deliveries.filter((row) => row.customer_id === customerId && within(row.delivery_date)).map((row) => ({
      id: row.id, date: row.delivery_date, detail: `${row.shift === "morning" ? "Subah" : "Shaam"} doodh`,
      litres: numeric(row.litres), charge: numeric(row.amount), credit: 0,
    })),
    ...data.companyBills.filter((row) => row.customer_id === customerId && within(row.to_date)).map((row) => ({
      id: row.id, date: row.to_date, detail: `Company parchi (${row.from_date} - ${row.to_date})`,
      litres: numeric(row.litres), charge: numeric(row.amount), credit: 0,
    })),
    ...data.payments.filter((row) => row.customer_id === customerId && within(row.payment_date)).map((row) => ({
      id: row.id, date: row.payment_date, detail: row.kind === "discount" ? "Riayat" : "Wusooli",
      litres: null, charge: 0, credit: numeric(row.amount),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function balanceLabel(balance: number): string {
  return balance > 0 ? `Baqi ${textMoney(balance)}` : balance < 0 ? `Customer ka advance ${textMoney(-balance)}` : "Hisaab saaf";
}

export function statementMessage(farm: FarmSettings, customer: Customer, month: string, report: CustomerReport): string {
  return [
    farm.farm_name, farm.contact_phone ? `Rabtay ka number: ${farm.contact_phone}` : "",
    `Assalam o Alaikum ${customer.name},`, `${formatMonth(`${month}-01`)} ka doodh hisaab:`,
    `Pichla baqaya: ${textMoney(numeric(report.previous_balance))}`,
    `Doodh delivery: ${numeric(report.litres)} L`,
    `Doodh / parchi ki raqam: ${textMoney(numeric(report.amount))}`,
    `Wusooli: ${textMoney(numeric(report.paid))}`,
    `Riayat: ${textMoney(numeric(report.discount))}`,
    balanceLabel(numeric(report.balance)), farm.whatsapp_footer,
  ].filter(Boolean).join("\n");
}

export function receiptMessage(farm: FarmSettings, customer: Customer, payment: Payment): string {
  return [farm.farm_name, farm.contact_phone ? `Rabtay ka number: ${farm.contact_phone}` : "",
    `${customer.name} se ${textMoney(numeric(payment.amount))} wusooli ${formatDay(payment.payment_date)} ko darj hui.`,
    `Receipt ref: ${payment.id}`, farm.whatsapp_footer].filter(Boolean).join("\n");
}

export function documentFilename(customer: Customer, kind: "bill" | "receipt", suffix: string): string {
  const safeName = customer.name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";
  return `${kind}-${safeName}-${suffix}.pdf`;
}

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

/** Warm the PDF code and fonts so a later user click can reach the native share sheet promptly. */
export async function prepareCustomerPdf(): Promise<void> {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  await Promise.all([installCustomerPdfFont(new jsPDF()), loadPdfLogo()]);
}

function drawHeader(pdf: Pdf, farm: FarmSettings, documentTitle: string, logo: Uint8Array<ArrayBuffer>): number {
  pdf.setFont("OpenSans", "bold"); pdf.setFontSize(17);
  const nameLines = pdf.splitTextToSize(farm.farm_name, 154) as string[];
  const headerHeight = Math.max(34, 19 + nameLines.length * 7);
  pdf.setFillColor(37, 94, 53);
  pdf.rect(0, 0, 210, headerHeight, "F");
  pdf.addImage(logo, "PNG", 14, 7, 20, 20);
  pdf.setTextColor(255, 255, 255);
  pdf.text(nameLines, 42, 14);
  pdf.setFont("OpenSans", "normal"); pdf.setFontSize(9);
  pdf.text(documentTitle, 42, headerHeight - 7);
  pdf.setTextColor(32, 42, 36);
  let y = headerHeight + 8;
  if (farm.owner_name) { pdf.text(`Maalik: ${farm.owner_name}`, 14, y); y += 5; }
  if (farm.contact_phone) { pdf.text(`Rabtay ka number: ${farm.contact_phone}`, 14, y); y += 5; }
  return y + 3;
}

function addFooters(pdf: Pdf, farmName: string) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(90, 100, 93);
    pdf.text(farmName, 14, 288);
    pdf.text(`Page ${page}/${pages}`, 196, 288, { align: "right" });
  }
}

export async function buildCustomerStatementPdf(input: {
  farm: FarmSettings; customer: Customer; month: string; report: CustomerReport; lines: StatementLine[];
}): Promise<Uint8Array<ArrayBuffer>> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const [, logo] = await Promise.all([installCustomerPdfFont(pdf), loadPdfLogo()]);
  pdf.setProperties({ title: `${input.customer.name} - ${input.month} ka bill` });
  let y = drawHeader(pdf, input.farm, "Customer ka maheena - tafseeli bill", logo);
  pdf.setFontSize(11); pdf.setFont("OpenSans", "bold");
  pdf.text(`Customer: ${input.customer.name}`, 14, y); y += 6;
  pdf.setFont("OpenSans", "normal"); pdf.setFontSize(9);
  if (input.customer.phone) { pdf.text(`Customer phone: ${input.customer.phone}`, 14, y); y += 5; }
  pdf.text(`Maheena: ${formatMonth(`${input.month}-01`)}`, 14, y); y += 7;
  autoTable(pdf, {
    startY: y, margin: { left: 14, right: 14, bottom: 19 },
    head: [["Tareekh", "Tafseel", "Doodh (L)", "Raqam (Rs)", "Wusooli (Rs)"]],
    body: input.lines.length ? input.lines.map((line) => [
      line.date, line.detail, line.litres == null ? "" : decimal(line.litres),
      line.charge ? pdfMoney(line.charge) : "", line.credit ? pdfMoney(line.credit) : "",
    ]) : [["", "Is maheene koi entry nahi", "", "", ""]],
    styles: { font: "OpenSans", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [37, 94, 53] },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 72 }, 2: { cellWidth: 22 }, 3: { cellWidth: 33 }, 4: { cellWidth: 33 } },
  });
  const lastTable = pdf as Pdf & { lastAutoTable?: { finalY: number } };
  y = (lastTable.lastAutoTable?.finalY ?? y) + 10;
  if (y > 236) { pdf.addPage(); y = 22; }
  const summary: [string, number][] = [
    ["Pichla baqaya", numeric(input.report.previous_balance)],
    ["Is maheene ki raqam", numeric(input.report.amount)],
    ["Wusooli", numeric(input.report.paid)],
    ["Riayat", numeric(input.report.discount)],
  ];
  pdf.setFontSize(10); pdf.setFont("OpenSans", "normal");
  for (const [label, value] of summary) {
    pdf.text(label, 105, y); pdf.text(pdfMoney(value), 195, y, { align: "right" }); y += 7;
  }
  pdf.setDrawColor(37, 94, 53); pdf.line(105, y - 2, 195, y - 2);
  pdf.setFont("OpenSans", "bold");
  const balance = numeric(input.report.balance);
  pdf.text(balance < 0 ? "Customer ka advance" : "Kul baqi", 105, y + 5);
  pdf.text(pdfMoney(Math.abs(balance)), 195, y + 5, { align: "right" });
  if (input.farm.whatsapp_footer) {
    const footerLines = pdf.splitTextToSize(input.farm.whatsapp_footer, 175) as string[];
    const footerY = Math.min(y + 19, 275);
    pdf.setFont("OpenSans", "normal"); pdf.setFontSize(8);
    pdf.text(footerLines, 14, footerY);
  }
  addFooters(pdf, input.farm.farm_name);
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function buildPaymentReceiptPdf(input: {
  farm: FarmSettings; customer: Customer; payment: Payment;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const [, logo] = await Promise.all([installCustomerPdfFont(pdf), loadPdfLogo()]);
  pdf.setProperties({ title: `${input.customer.name} - wusooli receipt` });
  let y = drawHeader(pdf, input.farm, "Wusooli ki receipt", logo);
  pdf.setFont("OpenSans", "normal"); pdf.setFontSize(10);
  pdf.text(`Customer: ${input.customer.name}`, 14, y); y += 8;
  if (input.customer.phone) { pdf.text(`Customer phone: ${input.customer.phone}`, 14, y); y += 8; }
  pdf.text(`Wusooli ki tareekh: ${formatDay(input.payment.payment_date)}`, 14, y); y += 8;
  pdf.text(`Tareeqa: ${input.payment.method ?? "Darj nahi"}`, 14, y); y += 12;
  pdf.setFillColor(235, 246, 236); pdf.roundedRect(14, y, 182, 27, 3, 3, "F");
  pdf.setTextColor(37, 94, 53); pdf.setFont("OpenSans", "bold"); pdf.setFontSize(12);
  pdf.text("Mili hui raqam", 20, y + 10);
  pdf.setFontSize(20); pdf.text(`Rs ${decimal(numeric(input.payment.amount))}`, 190, y + 18, { align: "right" });
  y += 39; pdf.setTextColor(32, 42, 36); pdf.setFont("OpenSans", "normal"); pdf.setFontSize(9);
  pdf.text(`Receipt reference: ${input.payment.id}`, 14, y); y += 10;
  pdf.text("Yeh receipt sirf upar likhi hui wusooli ki tasdeeq hai.", 14, y);
  if (input.farm.whatsapp_footer) pdf.text(pdf.splitTextToSize(input.farm.whatsapp_footer, 180), 14, y + 12);
  addFooters(pdf, input.farm.farm_name);
  return new Uint8Array(pdf.output("arraybuffer"));
}

/** Native share can attach the PDF on supported phones. Desktop falls back to download. */
export async function shareCustomerPdf(filename: string, bytes: Uint8Array<ArrayBuffer>, title: string, message: string): Promise<"shared" | "downloaded" | "cancelled" | "retry"> {
  const blob = new Blob([bytes], { type: "application/pdf" });
  let file: File | null = null;
  if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      const candidate = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [candidate] })) file = candidate;
    } catch { /* Treat a failed capability check like an unsupported file share. */ }
  }
  if (file) {
    try { await navigator.share({ files: [file], title, text: message }); return "shared"; }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // A slow PDF build can exhaust the click's transient activation. A second tap
      // can share the already-built file without waiting for generation again.
      if (error instanceof DOMException && error.name === "NotAllowedError") return "retry";
      // Browser share can fail when WhatsApp is unavailable; keep the PDF usable.
    }
  }
  downloadBlob(filename, blob);
  return "downloaded";
}

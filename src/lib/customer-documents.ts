import type { FarmData, Customer, CustomerReport, Payment } from "./farm-data";
import type { FarmSettings } from "./settings";
import { formatDay, formatMonth } from "./dates";
import { downloadBlob } from "./export-data";
import { loadPdfDeveloperLogo, loadPdfDeveloperQr, loadPdfLogo, pdfTrackingUrl } from "./pdf-brand";
import { installPdfFonts } from "./pdf/fonts";
import { CODING_MOVES_DEVELOPER_CREDIT, CODING_MOVES_DISPLAY_URL } from "./coding-moves";
import { SHIFT_LABELS } from "./milk-shifts";

export type StatementLine = {
  id: string; date: string; detail: string; litres: number | null; charge: number; credit: number;
};

const numeric = (value: number | string | null | undefined) => Number(value ?? 0);
const decimal = (value: number) => Math.abs(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pdfMoney = (value: number) => `${value < 0 ? "-" : ""}${decimal(value)}`;
const textMoney = (value: number) => `${value < 0 ? "-" : ""}Rs ${decimal(value)}`;
const shiftRank = (detail: string) => {
  const rank = ["Subah doodh", "Dopehr doodh", "Shaam doodh"].indexOf(detail);
  return rank < 0 ? 3 : rank;
};

/** The detail lines come from saved Supabase records; totals remain authoritative in the SQL report. */
export function statementLines(data: Pick<FarmData, "deliveries" | "companyBills" | "payments">, customerId: string, month: string): StatementLine[] {
  const within = (date: string) => date.slice(0, 7) === month;
  return [
    ...data.deliveries.filter((row) => row.customer_id === customerId && within(row.delivery_date)).map((row) => ({
      id: row.id, date: row.delivery_date, detail: `${SHIFT_LABELS[row.shift]} doodh`,
      litres: numeric(row.litres), charge: numeric(row.amount), credit: 0,
    })),
    ...data.companyBills.filter((row) => row.customer_id === customerId && within(row.to_date)).map((row) => ({
      id: row.id, date: row.to_date, detail: `Company parchi (${row.from_date} - ${row.to_date})`,
      litres: numeric(row.litres), charge: numeric(row.amount), credit: 0,
    })),
    ...data.payments.filter((row) => row.customer_id === customerId && within(row.payment_date)).map((row) => ({
      id: row.id, date: row.payment_date, detail: row.kind === "discount" ? "Riayat" : row.kind === "refund" ? "Customer advance wapas" : "Wusooli",
      litres: null, charge: 0, credit: row.kind === "refund" ? -numeric(row.amount) : numeric(row.amount),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date)
    || shiftRank(a.detail) - shiftRank(b.detail) || a.id.localeCompare(b.id));
}

export function balanceLabel(balance: number): string {
  return balance > 0 ? `Baqi ${textMoney(balance)}` : balance < 0 ? `Customer ka advance ${textMoney(-balance)}` : "Hisaab saaf";
}

export function statementMessage(farm: FarmSettings, customer: Customer, month: string, report: CustomerReport, noonLitres = 0): string {
  return [
    farm.farm_name, farm.contact_phone ? `Rabtay ka number: ${farm.contact_phone}` : "",
    `Assalam o Alaikum ${customer.name},`, `${formatMonth(`${month}-01`)} ka doodh hisaab:`,
    `Pichla baqaya: ${textMoney(numeric(report.previous_balance))}`,
    `Doodh delivery: ${numeric(report.litres)} L`,
    noonLitres > 0 ? `Dopehr delivery: ${noonLitres} L` : "",
    `Doodh / parchi ki raqam: ${textMoney(numeric(report.amount))}`,
    `Wusooli: ${textMoney(numeric(report.paid))}`,
    `Riayat: ${textMoney(numeric(report.discount))}`,
    numeric(report.refund) ? `Advance wapas: ${textMoney(numeric(report.refund))}` : "",
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
  await Promise.all([installPdfFonts(new jsPDF()), loadPdfLogo(), loadPdfDeveloperLogo(), loadPdfDeveloperQr()]);
}

function drawHeader(pdf: Pdf, farm: FarmSettings, documentTitle: string, logo: Uint8Array<ArrayBuffer>): number {
  pdf.addImage(logo, "PNG", 14, 10, 12, 12);
  pdf.setFont("BricolageGrotesque", "extrabold"); pdf.setFontSize(17); pdf.setTextColor(23, 41, 28);
  const nameLines = pdf.splitTextToSize(farm.farm_name, 115) as string[];
  pdf.text(nameLines, 30, 16);
  pdf.setFont("NotoSans", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(87, 99, 91);
  const owner = [farm.owner_name, farm.contact_phone].filter(Boolean).join(" · ");
  if (owner) pdf.text(`Maalik: ${owner}`, 30, 22);
  pdf.setFont("NotoSans", "bold"); pdf.setFontSize(11); pdf.setTextColor(29, 70, 38);
  pdf.text(documentTitle, 196, 16, { align: "right" });
  pdf.setFont("NotoSans", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(50, 62, 53);
  pdf.text("Customer ka hisaab", 196, 21, { align: "right" });
  pdf.setDrawColor(29, 70, 38); pdf.setLineWidth(0.7); pdf.line(14, 28, 196, 28);
  return 37;
}

function addFooters(pdf: Pdf, farmName: string, developerLogo: Uint8Array<ArrayBuffer>, developerQr: string, trackingUrl: string) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(222, 227, 220); pdf.setLineWidth(0.25); pdf.line(14, 270, 196, 270);
    pdf.setFont("NotoSans", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(83, 95, 86);
    pdf.text(farmName, 14, 276); pdf.text(`Page ${page} / ${pages}`, 14, 281);
    pdf.addImage(developerLogo, "PNG", 124, 271, 8, 8);
    pdf.setFont("NotoSans", "bold"); pdf.setFontSize(6.8); pdf.setTextColor(31, 42, 34);
    pdf.text(CODING_MOVES_DEVELOPER_CREDIT, 134, 275);
    pdf.setFont("NotoSans", "normal"); pdf.setFontSize(5.8); pdf.setTextColor(75, 86, 77);
    pdf.textWithLink(CODING_MOVES_DISPLAY_URL, 134, 280, { url: trackingUrl });
    pdf.addImage(developerQr, "PNG", 182, 271, 12, 12); pdf.link(124, 270, 72, 14, { url: trackingUrl });
  }
}

export async function buildCustomerStatementPdf(input: {
  farm: FarmSettings; customer: Customer; month: string; report: CustomerReport; lines: StatementLine[];
}): Promise<Uint8Array<ArrayBuffer>> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const trackingUrl = pdfTrackingUrl("customer-bill");
  const [, logo, developerLogo, developerQr] = await Promise.all([installPdfFonts(pdf), loadPdfLogo(), loadPdfDeveloperLogo(), loadPdfDeveloperQr(trackingUrl)]);
  pdf.setProperties({ title: `${input.customer.name} - ${input.month} ka bill` });
  let y = drawHeader(pdf, input.farm, "Customer ka maheena - tafseeli bill", logo);
  pdf.setFontSize(11); pdf.setFont("NotoSans", "bold");
  pdf.text(`Customer: ${input.customer.name}`, 14, y); y += 6;
  pdf.setFont("NotoSans", "normal"); pdf.setFontSize(9);
  if (input.customer.phone) { pdf.text(`Customer phone: ${input.customer.phone}`, 14, y); y += 5; }
  pdf.text(`Maheena: ${formatMonth(`${input.month}-01`)}`, 14, y); y += 7;
  autoTable(pdf, {
    startY: y, margin: { left: 14, right: 14, bottom: 19 },
    head: [["Tareekh", "Tafseel", "Doodh (L)", "Raqam (Rs)", "Wusooli (Rs)"]],
    body: input.lines.length ? input.lines.map((line) => [
      line.date, line.detail, line.litres == null ? "" : decimal(line.litres),
      line.charge ? pdfMoney(line.charge) : "", line.credit ? pdfMoney(line.credit) : "",
    ]) : [["", "Is maheene koi entry nahi", "", "", ""]],
    styles: { font: "NotoSans", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [230, 238, 231], textColor: [29, 70, 38], font: "NotoSans", fontStyle: "bold" },
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
    ["Advance wapas", numeric(input.report.refund)],
  ];
  pdf.setFontSize(10); pdf.setFont("NotoSans", "normal");
  for (const [label, value] of summary) {
    pdf.text(label, 105, y); pdf.text(pdfMoney(value), 195, y, { align: "right" }); y += 7;
  }
  pdf.setDrawColor(37, 94, 53); pdf.line(105, y - 2, 195, y - 2);
  pdf.setFont("NotoSans", "bold");
  const balance = numeric(input.report.balance);
  pdf.text(balance < 0 ? "Customer ka advance" : "Kul baqi", 105, y + 5);
  pdf.text(pdfMoney(Math.abs(balance)), 195, y + 5, { align: "right" });
  if (input.farm.whatsapp_footer) {
    const footerLines = pdf.splitTextToSize(input.farm.whatsapp_footer, 175) as string[];
    const footerY = Math.min(y + 19, 275);
    pdf.setFont("NotoSans", "normal"); pdf.setFontSize(8);
    pdf.text(footerLines, 14, footerY);
  }
  addFooters(pdf, input.farm.farm_name, developerLogo, developerQr, trackingUrl);
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function buildPaymentReceiptPdf(input: {
  farm: FarmSettings; customer: Customer; payment: Payment;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const trackingUrl = pdfTrackingUrl("customer-receipt");
  const [, logo, developerLogo, developerQr] = await Promise.all([installPdfFonts(pdf), loadPdfLogo(), loadPdfDeveloperLogo(), loadPdfDeveloperQr(trackingUrl)]);
  pdf.setProperties({ title: `${input.customer.name} - wusooli receipt` });
  let y = drawHeader(pdf, input.farm, "Wusooli ki receipt", logo);
  pdf.setFont("NotoSans", "normal"); pdf.setFontSize(10);
  pdf.text(`Customer: ${input.customer.name}`, 14, y); y += 8;
  if (input.customer.phone) { pdf.text(`Customer phone: ${input.customer.phone}`, 14, y); y += 8; }
  pdf.text(`Wusooli ki tareekh: ${formatDay(input.payment.payment_date)}`, 14, y); y += 8;
  pdf.text(`Tareeqa: ${input.payment.method ?? "Darj nahi"}`, 14, y); y += 12;
  pdf.setFillColor(235, 246, 236); pdf.roundedRect(14, y, 182, 27, 3, 3, "F");
  pdf.setTextColor(37, 94, 53); pdf.setFont("NotoSans", "bold"); pdf.setFontSize(12);
  pdf.text("Mili hui raqam", 20, y + 10);
  pdf.setFontSize(20); pdf.text(`Rs ${decimal(numeric(input.payment.amount))}`, 190, y + 18, { align: "right" });
  y += 39; pdf.setTextColor(32, 42, 36); pdf.setFont("NotoSans", "normal"); pdf.setFontSize(9);
  pdf.text(`Receipt reference: ${input.payment.id}`, 14, y); y += 10;
  pdf.text("Yeh receipt sirf upar likhi hui wusooli ki tasdeeq hai.", 14, y);
  if (input.farm.whatsapp_footer) pdf.text(pdf.splitTextToSize(input.farm.whatsapp_footer, 180), 14, y + 12);
  addFooters(pdf, input.farm.farm_name, developerLogo, developerQr, trackingUrl);
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

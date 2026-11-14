/** Load the same supplied PNG mark used by the installed app icon. */
import {
  CODING_MOVES_DEVELOPER_CREDIT,
  CODING_MOVES_DISPLAY_URL,
  CODING_MOVES_URL,
} from "./coding-moves";

let logoData: Promise<Uint8Array<ArrayBuffer>> | null = null;

export { CODING_MOVES_URL, CODING_MOVES_DEVELOPER_CREDIT as PDF_DEVELOPER_CREDIT };

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

/**
 * Keep the referral credit small and linked: farm records remain the document's
 * focus, while a shared PDF still leads a prospective client to the developer.
 */
export function addPdfDeveloperCredit(pdf: Pdf, y: number, pageWidth: number): void {
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 93);
  const credit = `${CODING_MOVES_DEVELOPER_CREDIT} · ${CODING_MOVES_DISPLAY_URL}`;
  const width = pdf.getTextWidth(credit);
  pdf.textWithLink(credit, (pageWidth - width) / 2, y, { url: CODING_MOVES_URL });
}

/** A compact vector CM mark: it keeps shared PDFs branded without a second image file. */
export function addPdfDeveloperMark(pdf: Pdf, right: number, top: number, light = false): void {
  const size = 12;
  const x = right - size;
  pdf.setFillColor(59, 130, 246);
  pdf.roundedRect(x, top, size, size, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text("CM", x + size / 2, top + 7.4, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(light ? 255 : 90, light ? 255 : 100, light ? 255 : 93);
  pdf.text(CODING_MOVES_DEVELOPER_CREDIT, right - 15, top + 4, { align: "right" });
  pdf.setFontSize(6);
  pdf.textWithLink(CODING_MOVES_DISPLAY_URL, right - 15, top + 8, { align: "right", url: CODING_MOVES_URL });
}

export function loadPdfLogo(): Promise<Uint8Array<ArrayBuffer>> {
  if (!logoData) {
    logoData = fetch("/brand/icon-192.png").then(async (response) => {
      if (!response.ok) throw new Error("PDF ka logo load nahi hua.");
      return new Uint8Array(await response.arrayBuffer());
    }).catch((error) => {
      logoData = null;
      throw error;
    });
  }
  return logoData;
}

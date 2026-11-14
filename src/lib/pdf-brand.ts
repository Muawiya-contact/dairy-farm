/** Load the same supplied PNG mark used by the installed app icon. */
let logoData: Promise<Uint8Array<ArrayBuffer>> | null = null;

export const CODING_MOVES_SERVICES_URL = "https://codingmoves.com/services/";
export const PDF_DEVELOPER_CREDIT = "Developed by Coding Moves";

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

/**
 * Keep the referral credit small and linked: farm records remain the document's
 * focus, while a shared PDF still leads a prospective client to the developer.
 */
export function addPdfDeveloperCredit(pdf: Pdf, y: number, pageWidth: number): void {
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 93);
  const width = pdf.getTextWidth(PDF_DEVELOPER_CREDIT);
  pdf.textWithLink(PDF_DEVELOPER_CREDIT, (pageWidth - width) / 2, y, { url: CODING_MOVES_SERVICES_URL });
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

/** Load the same supplied PNG mark used by the installed app icon. */
import {
  CODING_MOVES_DEVELOPER_CREDIT,
  CODING_MOVES_DISPLAY_URL,
  CODING_MOVES_URL,
} from "./coding-moves";

let logoData: Promise<Uint8Array<ArrayBuffer>> | null = null;
let developerLogoData: Promise<Uint8Array<ArrayBuffer>> | null = null;

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

/** Draw the official Coding Moves Services mark beside the shared-document credit. */
export function addPdfDeveloperMark(pdf: Pdf, logo: Uint8Array<ArrayBuffer>, right: number, top: number, light = false): void {
  const size = 12;
  const x = right - size;
  pdf.addImage(logo, "PNG", x, top, size, size);
  pdf.setFontSize(7);
  pdf.setTextColor(light ? 255 : 90, light ? 255 : 100, light ? 255 : 93);
  pdf.text(CODING_MOVES_DEVELOPER_CREDIT, right - 15, top + 4, { align: "right" });
  pdf.setFontSize(6);
  pdf.textWithLink(CODING_MOVES_DISPLAY_URL, right - 15, top + 8, { align: "right", url: CODING_MOVES_URL });
}

/** The browser uses the matching SVG. jsPDF needs this small raster rendition. */
export function loadPdfDeveloperLogo(): Promise<Uint8Array<ArrayBuffer>> {
  if (!developerLogoData) {
    developerLogoData = fetch("/brand/coding-moves-services.png").then(async (response) => {
      if (!response.ok) throw new Error("Coding Moves ka logo load nahi hua.");
      return new Uint8Array(await response.arrayBuffer());
    }).catch((error) => {
      developerLogoData = null;
      throw error;
    });
  }
  return developerLogoData;
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

import type { jsPDF } from "jspdf";

const files = [
  ["NotoSans-Regular.ttf", "NotoSans", "normal"],
  ["NotoSans-SemiBold.ttf", "NotoSans", "semibold"],
  ["NotoSans-Bold.ttf", "NotoSans", "bold"],
  ["BricolageGrotesque-ExtraBold.ttf", "BricolageGrotesque", "extrabold"],
] as const;

let fontData: Promise<string[]> | null = null;

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function loadFonts(): Promise<string[]> {
  if (!fontData) {
    fontData = Promise.all(files.map(async ([filename]) => {
      const response = await fetch(`/fonts/pdf/${filename}`);
      if (!response.ok) throw new Error("PDF font load nahi hua. Dobara koshish karein.");
      return base64(new Uint8Array(await response.arrayBuffer()));
    })).catch((error) => { fontData = null; throw error; });
  }
  return fontData;
}

/** Every exported document embeds these fonts. Never silently use Helvetica. */
export async function installPdfFonts(pdf: jsPDF): Promise<void> {
  const data = await loadFonts();
  files.forEach(([filename, family, style], index) => {
    pdf.addFileToVFS(filename, data[index]);
    pdf.addFont(filename, family, style);
  });
  pdf.setFont("NotoSans", "normal");
}

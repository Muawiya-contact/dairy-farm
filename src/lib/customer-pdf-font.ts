import type { jsPDF } from "jspdf";

const files = [
  ["OpenSans-Regular.ttf", "normal"],
  ["OpenSans-Bold.ttf", "bold"],
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
      const response = await fetch(`/fonts/${filename}`);
      if (!response.ok) throw new Error("PDF font load nahi hua.");
      return base64(new Uint8Array(await response.arrayBuffer()));
    })).catch((error) => { fontData = null; throw error; });
  }
  return fontData;
}

export async function installCustomerPdfFont(pdf: jsPDF): Promise<void> {
  const fonts = await loadFonts();
  files.forEach(([filename, style], index) => {
    pdf.addFileToVFS(filename, fonts[index]);
    pdf.addFont(filename, "OpenSans", style);
  });
  pdf.setFont("OpenSans", "normal");
}

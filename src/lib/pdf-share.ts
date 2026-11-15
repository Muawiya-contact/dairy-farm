import { downloadBlob } from "./export-data";

export type PdfShareOutcome = "shared" | "downloaded" | "cancelled";

/** Native share attaches the actual PDF on supported phones; desktop downloads it. */
export async function sharePdfFile(filename: string, bytes: Uint8Array<ArrayBuffer>, title: string, text: string): Promise<PdfShareOutcome> {
  const blob = new Blob([bytes], { type: "application/pdf" });
  if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title, text }); return "shared"; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "cancelled"; }
      }
    } catch { /* Fall through to a usable download. */ }
  }
  downloadBlob(filename, blob);
  return "downloaded";
}

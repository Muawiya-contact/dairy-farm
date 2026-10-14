/** Load the same supplied PNG mark used by the installed app icon. */
let logoData: Promise<Uint8Array<ArrayBuffer>> | null = null;

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

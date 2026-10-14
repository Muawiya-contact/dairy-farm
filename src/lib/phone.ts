/** Store user-entered mobile numbers in E.164 form for receipts and WhatsApp. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("-")) throw new RangeError("Phone number +923001234567 ya 03xxxxxxxxx ki tarah likhein.");
  const value = trimmed.replace(/[\s()-]/g, "");
  if (!value) return "";
  if (/^03\d{9}$/.test(value)) return `+92${value.slice(1)}`;
  if (/^3\d{9}$/.test(value)) return `+92${value}`;
  if (/^923\d{9}$/.test(value)) return `+${value}`;
  if (/^\+[1-9]\d{6,14}$/.test(value)) return value;
  throw new RangeError("Phone number +923001234567 ya 03xxxxxxxxx ki tarah likhein.");
}

export function whatsappNumber(input: string | null): string | null {
  if (!input) return null;
  try { return normalizePhone(input).slice(1) || null; }
  catch { return null; }
}

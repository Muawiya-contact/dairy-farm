function numberValue(value: number, digits: number): string {
  if (!Number.isFinite(value)) throw new RangeError("Invalid number");
  return Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function rs(value: number): string {
  return `${value < 0 ? "− " : ""}Rs ${numberValue(value, 2)}`;
}

export function litres(value: number): string {
  return `${value < 0 ? "−" : ""}${numberValue(value, 2)} L`;
}

function parseDecimal(input: string, signed: boolean): number {
  const trimmed = input.trim();
  const pattern = signed ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(trimmed)) {
    throw new RangeError(signed ? "Valid raqam likhein (2 decimal tak)." : "Valid non-negative number likhein (2 decimal tak).");
  }
  const value = Number(trimmed.replaceAll(",", ""));
  if (!Number.isSafeInteger(Math.round(value * 100))) throw new RangeError("Raqam bohat bari hai.");
  return value;
}

export const parseAmount = (input: string) => parseDecimal(input, false);
export const parseLitres = parseAmount;
export const parseSignedAmount = (input: string) => parseDecimal(input, true);
export function parsePositiveAmount(input: string): number {
  const amount = parseAmount(input);
  if (amount <= 0) throw new RangeError("Raqam 0 se zyada likhein.");
  return amount;
}

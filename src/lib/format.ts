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

function parseNonNegative(input: string): number {
  const trimmed = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new RangeError("Valid non-negative number likhein (2 decimal tak).");
  }
  const value = Number(trimmed.replaceAll(",", ""));
  if (!Number.isSafeInteger(Math.round(value * 100))) throw new RangeError("Raqam bohat bari hai.");
  return value;
}

export const parseAmount = parseNonNegative;
export const parseLitres = parseNonNegative;

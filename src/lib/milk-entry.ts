import { parseLitres } from "./format";

export function milkLitres(raw: string, maximum: number): number {
  const value = parseLitres(raw);
  if (value > maximum) throw new RangeError(`Doodh ${maximum} L se zyada nahi ho sakta.`);
  return value;
}

export function sumMilkLitres(values: readonly number[]): number {
  return values.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
}

export function remainingMilk(produced: number, delivered: number): number {
  return (Math.round(produced * 100) - Math.round(delivered * 100)) / 100;
}

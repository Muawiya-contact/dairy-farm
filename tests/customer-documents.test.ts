import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  balanceLabel, buildCustomerStatementPdf, buildPaymentReceiptPdf, documentFilename,
  receiptMessage, shareCustomerPdf, statementLines, statementMessage,
} from "../src/lib/customer-documents";
import type { Customer, CustomerReport, FarmData, Payment } from "../src/lib/farm-data";
import type { FarmSettings } from "../src/lib/settings";

const farm = { farm_name: "Saim Dairy Farm", owner_name: "Saim", contact_phone: "+923001234567", whatsapp_footer: "Shukriya" } as FarmSettings;
const customer = { id: "c1", name: "Ahmed / Test", phone: "+923001234568" } as Customer;
const report = { customer_id: "c1", previous_balance: -500, litres: 10, amount: 1800, paid: 500, discount: 0, balance: 800 } as CustomerReport;
const payment = { id: "payment-1", customer_id: "c1", payment_date: "2026-10-14", amount: 500, kind: "payment", method: "cash", account_id: "a1", note: null } as Payment;
const data = {
  deliveries: [
    { id: "d1", customer_id: "c1", delivery_date: "2026-10-13", shift: "morning" as const, litres: 10, rate: 180, amount: 1800 },
    { id: "d2", customer_id: "c1", delivery_date: "2026-09-30", shift: "morning" as const, litres: 2, rate: 180, amount: 360 },
  ],
  companyBills: [], payments: [payment],
} satisfies Pick<FarmData, "deliveries" | "companyBills" | "payments">;

beforeAll(() => vi.stubGlobal("fetch", async (url: string) => {
  const filename = url.split("/").pop();
  if (filename !== "OpenSans-Regular.ttf" && filename !== "OpenSans-Bold.ttf") return new Response(null, { status: 404 });
  return new Response(readFileSync(resolve("public/fonts", filename)));
}));
afterAll(() => vi.unstubAllGlobals());

it("builds a selected-month ledger from saved records without pulling in another month", () => {
  expect(statementLines(data, "c1", "2026-10")).toMatchObject([
    { id: "d1", charge: 1800, credit: 0, litres: 10 },
    { id: "payment-1", charge: 0, credit: 500, litres: null },
  ]);
  expect(balanceLabel(-500)).toContain("advance");
  expect(balanceLabel(800)).toContain("Baqi");
  expect(documentFilename(customer, "bill", "2026-10")).toBe("bill-Ahmed-Test-2026-10.pdf");
});

it("includes farm identity and exact payment reference in share text", () => {
  expect(statementMessage(farm, customer, "2026-10", report)).toContain("+923001234567");
  expect(statementMessage(farm, customer, "2026-10", report)).toContain("Baqi Rs 800.00");
  expect(statementMessage(farm, customer, "2026-10", report)).toContain("Doodh delivery: 10 L");
  expect(receiptMessage(farm, customer, payment)).toContain("payment-1");
});

it("generates separate readable statement and payment PDFs", async () => {
  const statement = await buildCustomerStatementPdf({ farm, customer, month: "2026-10", report, lines: statementLines(data, "c1", "2026-10") });
  const receipt = await buildPaymentReceiptPdf({ farm, customer, payment });
  expect(new TextDecoder().decode(statement.slice(0, 8))).toBe("%PDF-1.3");
  expect(new TextDecoder().decode(receipt.slice(0, 8))).toBe("%PDF-1.3");
  expect(statement.length).toBeGreaterThan(2000);
  expect(receipt.length).toBeGreaterThan(2000);
});

it("hands the receipt PDF to the phone's app chooser", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const canShare = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", { share, canShare });
  const bytes = new Uint8Array([37, 80, 68, 70]);

  expect(await shareCustomerPdf("receipt.pdf", bytes, "Saim Dairy Farm", "Wusooli receipt")).toBe("shared");
  const payload = share.mock.calls[0][0] as ShareData;
  expect(payload.title).toBe("Saim Dairy Farm");
  expect(payload.text).toBe("Wusooli receipt");
  expect(payload.files?.[0]).toMatchObject({ name: "receipt.pdf", type: "application/pdf" });
  expect(canShare).toHaveBeenCalledWith({ files: payload.files });
  expect(new Uint8Array(await payload.files![0].arrayBuffer())).toEqual(bytes);
});

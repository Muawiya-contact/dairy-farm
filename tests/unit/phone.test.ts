import { expect, it } from "vitest";
import { normalizePhone, whatsappChatUrl, whatsappNumber } from "../../src/lib/phone";

it("normalizes local and international phone formats for receipts", () => {
  expect(normalizePhone("0300 123 4567")).toBe("+923001234567");
  expect(normalizePhone("923001234567")).toBe("+923001234567");
  expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  expect(normalizePhone(" ")).toBe("");
  expect(whatsappNumber("0300-1234567")).toBe("923001234567");
  expect(whatsappNumber("bad data")).toBeNull();
  expect(whatsappChatUrl("0300-1234567", "Bill: Rs 500"))
    .toBe("https://wa.me/923001234567?text=Bill%3A%20Rs%20500");
  expect(whatsappChatUrl(null, "Bill: Rs 500")).toBeNull();
});

it.each(["-923001234567", "0300123", "abc", "0000000000", "+0"])("rejects invalid phone %s", (input) => {
  expect(() => normalizePhone(input)).toThrow(RangeError);
});

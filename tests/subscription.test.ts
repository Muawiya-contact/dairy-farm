import { describe, expect, it } from "vitest";
import { subscriptionMessage, type SubscriptionStatus } from "../src/lib/subscription";

const status = (remaining: number | null, readOnly = false): SubscriptionStatus => ({
  expires_on: remaining === null ? null : "2026-10-23", farm_date: "2026-10-16",
  days_remaining: remaining, read_only: readOnly,
});

describe("annual fee notice", () => {
  it("stays hidden without an expiry or outside seven days", () => {
    expect(subscriptionMessage(status(null))).toBeNull();
    expect(subscriptionMessage(status(8))).toBeNull();
  });
  it("shows a short seven-day warning through the last day", () => {
    expect(subscriptionMessage(status(7))).toContain("7 din baqi");
    expect(subscriptionMessage(status(0))).toContain("aaj aakhri din");
  });
  it("explains read-only access after expiry", () => {
    expect(subscriptionMessage(status(-1, true))).toContain("Data dekh sakte hain");
  });
});

import { describe, expect, it, vi } from "vitest";
import { friendlyError } from "../../src/lib/errors";

describe("friendly database errors", () => {
  it("maps database errors and named constraints", () => {
    expect(friendlyError({ message: "MONTH_LOCKED: October" })).toContain("maheena band");
    expect(friendlyError({ code: "23505", details: "Key already exists", message: "duplicate key violates unique constraint animals_active_tag_uq" })).toContain("tag ka janwar");
    expect(friendlyError({ message: "customer_rates_customer_id_effective_from_key" })).toContain("rate pehle se");
  });

  it("identifies offline, paused and expired sessions", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toContain("Internet nahi");
    expect(friendlyError({ status: 503, message: "Service unavailable" })).toContain("Database so raha");
    expect(friendlyError({ status: 401 })).toContain("Dobara login");
    expect(friendlyError({ code: "PGRST116", message: "The result contains 0 rows" })).toContain("Reload karein");
    expect(friendlyError(new Error("Supabase URL aur publishable key set nahi hain."))).toContain("settings missing");
  });

  it("hides unknown database details and logs once", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("private database details");
    expect(friendlyError(error)).toBe("Kuch ghalat ho gaya. Dobara koshish karein.");
    expect(friendlyError(error)).not.toContain("private");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

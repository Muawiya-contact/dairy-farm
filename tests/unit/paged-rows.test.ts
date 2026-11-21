import { describe, expect, it, vi } from "vitest";
import { loadPagedRows } from "@/lib/paged-rows";

describe("loadPagedRows", () => {
  it("collects every row across full and partial pages", async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
    const loadPage = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));

    await expect(loadPagedRows(loadPage)).resolves.toEqual(rows);
    expect(loadPage.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("returns an empty result after the first empty page", async () => {
    const loadPage = vi.fn(async () => ({ data: null, error: null }));

    await expect(loadPagedRows(loadPage)).resolves.toEqual([]);
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it("stops and reports a page error", async () => {
    const error = new Error("page failed");
    const loadPage = vi.fn(async () => ({ data: null, error }));

    await expect(loadPagedRows(loadPage)).rejects.toBe(error);
    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});

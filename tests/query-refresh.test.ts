import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { refreshFarmViews } from "../src/lib/query-refresh";

it("invalidates account and customer totals after a milk save", async () => {
  const client = new QueryClient();
  for (const key of ["farm-data", "galla", "customer-report", "salary"]) client.setQueryData([key], 1);
  await refreshFarmViews(client, "milk");
  for (const key of ["farm-data", "galla", "customer-report"]) expect(client.getQueryState([key])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["salary"])?.isInvalidated).toBe(false);
});

it("invalidates the sale account after closing an animal", async () => {
  const client = new QueryClient();
  client.setQueryData(["galla", "summary", "2026-10"], 1);
  client.setQueryData(["farm-data"], 1);
  await refreshFarmViews(client, "animal");
  expect(client.getQueryState(["galla", "summary", "2026-10"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["farm-data"])?.isInvalidated).toBe(true);
});

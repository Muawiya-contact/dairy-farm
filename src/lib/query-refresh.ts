import type { QueryClient } from "@tanstack/react-query";

const affectedKeys = {
  milk: ["farm-data", "galla", "customer-report"],
  animal: ["farm-data", "galla"],
} as const;

/** Mark related screens stale immediately after a confirmed database write. */
export async function refreshFarmViews(client: QueryClient, change: keyof typeof affectedKeys): Promise<void> {
  await Promise.all(affectedKeys[change].map((key) => client.invalidateQueries({ queryKey: [key] }, { throwOnError: true })));
}

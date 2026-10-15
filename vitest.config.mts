import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    maxWorkers: 2,
    projects: [
      { test: { name: "node", include: ["tests/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
        test: {
          name: "ui",
          include: ["tests/ui/**/*.test.tsx"],
          environment: "happy-dom",
          setupFiles: ["tests/ui/setup.ts"],
        },
      },
    ],
  },
});

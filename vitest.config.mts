import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    testTimeout: 30_000,
    maxWorkers: 2,
    projects: [
      { test: { name: "node", include: ["tests/**/*.test.ts"], environment: "node" } },
      {
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

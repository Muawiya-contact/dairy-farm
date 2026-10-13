import { spawnSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../src/lib/database.types.ts", import.meta.url));
const temporary = mkdtempSync(join(dirname(target), ".db-types-"));

try {
  const result = spawnSync("npx", ["--yes", "supabase@2.120.0", "gen", "types", "typescript", "--project-id", "dlirssfoazlxzyamsltv"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Supabase type generation failed (exit ${result.status}).`);
  if (!/^export type Database =/m.test(result.stdout)) throw new Error("Supabase returned no database types.");

  const generated = join(temporary, "database.types.ts");
  writeFileSync(generated, result.stdout);
  renameSync(generated, target);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

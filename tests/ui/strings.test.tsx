import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const banned = /\b(?:Supabase|PR|migration|Female|Male|Connection check|Invalid|valid|alag PR|Opening balance|Opening date|Active|Sign in|offsets|service)\b/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:tsx|ts)$/.test(entry.name) ? [path] : [];
  });
}

it("keeps developer and English terms out of UI-facing text", () => {
  const problems: string[] = [];
  for (const path of [...files(resolve("src/components")), ...files(resolve("src/app"))]) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const inspect = (node: ts.Node) => {
      // Check JSX copy and string values (including messages passed to friendlyError).
      if ((ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && banned.test(node.getText(source))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        problems.push(`${path}:${line}: ${node.getText(source).slice(0, 100)}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
  expect(problems).toEqual([]);
});

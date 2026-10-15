// Runs only against a local Supabase stack. Never resets or accesses a linked project.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const root = process.cwd();
const cli = resolve(root, "node_modules/.bin/supabase");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const cliEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
const local = (raw) => {
  try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(raw).hostname); }
  catch { return false; }
};
function status() {
  const output = execFileSync(cli, ["status", "-o", "env"], { cwd: root, env: cliEnv, encoding: "utf8" });
  return Object.fromEntries(output.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const split = line.indexOf("=");
    const value = line.slice(split + 1);
    return [line.slice(0, split), value.startsWith('"') ? JSON.parse(value) : value];
  }));
}

const before = status();
if (!local(before.API_URL) || !local(before.DB_URL)) throw new Error("E2E needs a running localhost Supabase stack.");
execFileSync(cli, ["db", "reset", "--local", "--yes"], { cwd: root, env: cliEnv, stdio: "inherit" });
const keys = status();
if (!local(keys.API_URL) || !local(keys.DB_URL) || !keys.PUBLISHABLE_KEY?.startsWith("sb_publishable_") || !keys.SERVICE_ROLE_KEY) {
  throw new Error("Local Supabase status did not provide the required API, database and local keys.");
}

const email = `playwright-${randomUUID()}@example.test`;
const password = `LocalOnly!${randomUUID()}`;
const admin = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user) throw created.error ?? new Error("Local test user was not created.");
const db = new pg.Client({ connectionString: keys.DB_URL });
try {
  await db.connect();
  await db.query("insert into private.app_owner (singleton, user_id) values (true, $1) on conflict (singleton) do update set user_id = excluded.user_id", [created.data.user.id]);
} finally { await db.end(); }
writeFileSync(resolve(root, "e2e/.local-auth.json"), JSON.stringify({ email, password }), { mode: 0o600 });

execFileSync(npm, ["run", "build"], {
  cwd: root, stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_ENV: "test",
    NEXT_PUBLIC_REQUIRE_AUTH: "true",
    NEXT_PUBLIC_SUPABASE_URL: keys.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.PUBLISHABLE_KEY,
  },
});

const output = resolve(root, "out");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json", ".woff": "font/woff", ".woff2": "font/woff2" };
createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1:4173").pathname); }
  catch { response.writeHead(400).end(); return; }
  let file = resolve(output, `.${path}`);
  if (file !== output && !file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  const ext = file.slice(file.lastIndexOf("."));
  response.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream", "Cache-Control": "no-store" });
  if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
}).listen(4173, "127.0.0.1", () => console.log("E2E static export ready on http://127.0.0.1:4173"));

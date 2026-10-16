import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";

const projectRefs = {
  staging: "dlirssfoazlxzyamsltv",
  production: "ylipnghdygpyqlptqazx",
};

/** @param {Record<string, string | undefined>} env */
export function validateBuildEnv(env) {
  const appEnv = env.NEXT_PUBLIC_APP_ENV;
  if (appEnv !== "staging" && appEnv !== "production" && appEnv !== "test") {
    return "NEXT_PUBLIC_APP_ENV must be staging, production, or test.";
  }
  if (appEnv === "test") {
    let url;
    try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ""); } catch { /* Invalid URL below. */ }
    if (url?.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return "Test builds require a plain HTTP localhost Supabase URL with an explicit port.";
    }
  } else {
    const expectedUrl = `https://${projectRefs[appEnv]}.supabase.co`;
    if (env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== expectedUrl) {
      return `NEXT_PUBLIC_SUPABASE_URL must be ${expectedUrl} for ${appEnv}; check the Netlify deploy-context value.`;
    }
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
    return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set to a publishable key.";
  }
  if ((appEnv === "production" || appEnv === "test") && env.NEXT_PUBLIC_REQUIRE_AUTH !== "true") {
    return `${appEnv} requires NEXT_PUBLIC_REQUIRE_AUTH=true.`;
  }
  if (appEnv === "staging" && env.NEXT_PUBLIC_REQUIRE_AUTH !== "false") {
    return "Staging requires NEXT_PUBLIC_REQUIRE_AUTH=false.";
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd());
  const issue = validateBuildEnv(process.env);
  if (issue) {
    console.error(`Build configuration error: ${issue}`);
    process.exitCode = 1;
  }
}

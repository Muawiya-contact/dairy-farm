import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";

const projectRefs = {
  staging: "dlirssfoazlxzyamsltv",
  production: "ylipnghdygpyqlptqazx",
};

/** @param {Record<string, string | undefined>} env */
export function validateBuildEnv(env) {
  const appEnv = env.NEXT_PUBLIC_APP_ENV;
  if (appEnv !== "staging" && appEnv !== "production") {
    return "NEXT_PUBLIC_APP_ENV must be staging or production.";
  }
  const expectedUrl = `https://${projectRefs[appEnv]}.supabase.co`;
  if (env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== expectedUrl) {
    return `NEXT_PUBLIC_SUPABASE_URL must point to the ${appEnv} Supabase project.`;
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
    return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set to a publishable key.";
  }
  if (appEnv === "production" && env.NEXT_PUBLIC_REQUIRE_AUTH !== "true") {
    return "Production requires NEXT_PUBLIC_REQUIRE_AUTH=true.";
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

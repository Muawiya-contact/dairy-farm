import { describe, expect, it } from "vitest";
import { validateBuildEnv } from "../scripts/validate-build-env.mjs";

const staging = {
  NEXT_PUBLIC_APP_ENV: "staging",
  NEXT_PUBLIC_SUPABASE_URL: "https://dlirssfoazlxzyamsltv.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_REQUIRE_AUTH: "false",
};

describe("static build environment", () => {
  it("accepts correctly paired staging and production settings", () => {
    expect(validateBuildEnv(staging)).toBeNull();
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_APP_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://ylipnghdygpyqlptqazx.supabase.co",
      NEXT_PUBLIC_REQUIRE_AUTH: "true" })).toBeNull();
  });
  it("rejects missing, crossed, or unsafe settings", () => {
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_APP_ENV: undefined })).toMatch(/APP_ENV/);
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined })).toMatch(/PUBLISHABLE_KEY/);
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "https://ylipnghdygpyqlptqazx.supabase.co" })).toMatch(/staging/);
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_APP_ENV: "production", NEXT_PUBLIC_REQUIRE_AUTH: "false" })).not.toBeNull();
  });
});

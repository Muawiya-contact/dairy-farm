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
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "https://ylipnghdygpyqlptqazx.supabase.co" }))
      .toContain("https://dlirssfoazlxzyamsltv.supabase.co");
    expect(validateBuildEnv({ ...staging, NEXT_PUBLIC_APP_ENV: "production", NEXT_PUBLIC_REQUIRE_AUTH: "false" })).not.toBeNull();
  });
  it("permits test mode only for a localhost stack with sign-in", () => {
    const local = { ...staging, NEXT_PUBLIC_APP_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_REQUIRE_AUTH: "true" };
    expect(validateBuildEnv(local)).toBeNull();
    for (const url of ["https://dlirssfoazlxzyamsltv.supabase.co", "http://localhost.evil.test:54321", "http://192.168.1.4:54321", "http://localhost:54321@evil.test/"]) {
      expect(validateBuildEnv({ ...local, NEXT_PUBLIC_SUPABASE_URL: url })).toMatch(/localhost/);
    }
    expect(validateBuildEnv({ ...local, NEXT_PUBLIC_REQUIRE_AUTH: "false" })).toMatch(/REQUIRE_AUTH/);
  });
});

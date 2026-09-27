import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env-schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test_configuration_only",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test`;

describe("public environment boundary", () => {
  it("accepts publishable keys and local app URLs", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });
  it("accepts legacy anon keys", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })).not.toThrow();
  });
  it.each(["sb_secret_do_not_expose", jwt("service_role"), "invalid"])("rejects non-public key %# without leaking it", (key) => {
    try {
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: key });
      expect.fail("Expected validation failure");
    } catch (error) {
      expect((error as Error).message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect((error as Error).message).not.toContain(key);
    }
  });
  it("rejects missing configuration", () => {
    expect(() => parsePublicEnv({})).toThrow("Invalid or missing environment variables");
  });
  it.each(["javascript:alert(1)", "https://user:password@example.com", "not-a-url"])("rejects unsafe URL %#", (url) => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});

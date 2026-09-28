import { describe, expect, it } from "vitest";
import { normalizeAppOrigin, PRODUCTION_APP_ORIGIN, safeCallbackDestination } from "./urls";

describe("authentication URLs", () => {
  it("uses the canonical production origin", () => {
    expect(normalizeAppOrigin(`${PRODUCTION_APP_ORIGIN}/ignored`, true)).toBe(PRODUCTION_APP_ORIGIN);
  });

  it("rejects localhost and other origins in production", () => {
    expect(() => normalizeAppOrigin("http://localhost:3000", true)).toThrow("production Mtaa Connect domain");
    expect(() => normalizeAppOrigin("https://example.com", true)).toThrow("production Mtaa Connect domain");
  });

  it("allows local development origins outside production", () => {
    expect(normalizeAppOrigin("http://localhost:3000/path", false)).toBe("http://localhost:3000");
  });

  it.each([null, "", "//evil.example", "https://evil.example", "/admin?next=evil", "/unknown"])(
    "rejects an unsafe callback destination %#",
    (value) => expect(safeCallbackDestination(value)).toBe("/admin"),
  );

  it.each(["/admin", "/agent", "/reset-password"])("accepts callback destination %s", (value) => {
    expect(safeCallbackDestination(value)).toBe(value);
  });
});

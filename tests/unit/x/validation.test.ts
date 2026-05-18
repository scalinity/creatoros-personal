import { describe, expect, it } from "vitest";

import { xOAuthStartQuerySchema } from "@/lib/x/validation";

// SCA-522 (S-16): regression coverage for the OAuth return_to allowlist.
// `allowedReturnTargets` in lib/x/validation.ts silently coerces unknown
// values to "/settings/x-connection" — that's the intended behavior, but
// also a quiet one: an attacker who supplies `?return_to=https://evil`
// gets a 200, an audit row with their value in metadata, and a redirect
// to the canonical settings page. Future contributors must not silently
// expand this allowlist, and any expansion must surface in the test
// failure here so it gets reviewed.

describe("xOAuthStartQuerySchema return_to allowlist", () => {
  it("accepts the canonical settings path", () => {
    const parsed = xOAuthStartQuerySchema.safeParse({ return_to: "/settings/x-connection" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.return_to).toBe("/settings/x-connection");
    }
  });

  it("defaults to /settings/x-connection when return_to is missing", () => {
    const parsed = xOAuthStartQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.return_to).toBe("/settings/x-connection");
    }
  });

  it.each([
    "https://evil.example/exfil",
    "//evil.example/path",
    "/settings/x-connection/../malicious",
    "/some/other/path",
    "javascript:alert(1)",
    "data:text/html,evil",
    "",
    "   ",
    "/settings/X-Connection", // case-mismatch
  ])("silently coerces unknown / unsafe return_to value %j to the canonical path", (input) => {
    const parsed = xOAuthStartQuerySchema.safeParse({ return_to: input });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.return_to).toBe("/settings/x-connection");
    }
  });

  it("pins the allowlist to exactly one entry — any expansion is intentional", () => {
    // This guard exists so a future contributor adding a new allowlisted
    // path has to update this test deliberately. If you legitimately need
    // to add a new return_to target, add it here AND ensure every server
    // action / route handler that reads it has been audited for the new
    // case.
    const probe = [
      "/settings/x-connection",
      "/settings",
      "/dashboard",
      "/composer",
      "/calendar",
      "/account-research",
    ];
    const accepted = probe.filter((value) => {
      const parsed = xOAuthStartQuerySchema.safeParse({ return_to: value });
      return parsed.success && parsed.data.return_to === value;
    });
    expect(accepted).toEqual(["/settings/x-connection"]);
  });
});

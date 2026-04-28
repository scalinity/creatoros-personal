import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPersonalSaveTokenPrefix,
  hashPersonalSaveToken,
  verifyPersonalSaveToken,
} from "@/lib/security/personal-save-token";

const pepper = "phase08-save-token-pepper";

describe("personal save token hashing", () => {
  it("hashes tokens with the configured pepper and exposes only a short prefix", () => {
    const token = "cos_live_abcdefghijklmnopqrstuvwxyz0123456789";
    const hash = hashPersonalSaveToken(token, { pepper });

    expect(hash).toMatch(/^pst_v1\$/);
    expect(hash).not.toContain(token);
    expect(hashPersonalSaveToken(token, { pepper })).toBe(hash);
    expect(hashPersonalSaveToken(token, { pepper: "different-pepper" })).not.toBe(hash);
    expect(getPersonalSaveTokenPrefix(token)).toBe("cos_live_abcd");
  });

  it("verifies tokens with timing-safe comparison semantics", () => {
    const token = "cos_live_abcdefghijklmnopqrstuvwxyz0123456789";
    const hash = hashPersonalSaveToken(token, { pepper });

    expect(verifyPersonalSaveToken(token, hash, { pepper })).toBe(true);
    expect(verifyPersonalSaveToken("cos_live_wrong", hash, { pepper })).toBe(false);
    expect(verifyPersonalSaveToken(token, "not-a-valid-hash", { pepper })).toBe(false);
  });
});

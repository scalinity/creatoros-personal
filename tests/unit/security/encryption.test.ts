import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptToken, encryptToken } from "@/lib/security/encryption";

const key = "phase08-encryption-key-material-32";

describe("token encryption helpers", () => {
  it("encrypts token material without storing plaintext and decrypts it with the same key", () => {
    const encrypted = encryptToken("x-access-token-secret", { key, purpose: "x_oauth_token" });

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("x-access-token-secret");
    expect(decryptToken(encrypted, { key, purpose: "x_oauth_token" })).toBe("x-access-token-secret");
  });

  it("rejects tampered ciphertext and mismatched purposes", () => {
    const encrypted = encryptToken("refresh-token-secret", { key, purpose: "x_oauth_token" });
    const tampered = encrypted.replace(/.$/, encrypted.endsWith("a") ? "b" : "a");

    expect(() => decryptToken(tampered, { key, purpose: "x_oauth_token" })).toThrow("Token payload could not be decrypted.");
    expect(() => decryptToken(encrypted, { key, purpose: "personal_save_token" })).toThrow("Token payload could not be decrypted.");
  });
});

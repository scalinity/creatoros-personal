import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const HASH_VERSION = "pst_v1";
const DEFAULT_PREFIX_LENGTH = 13;

export type PersonalSaveTokenHashOptions = {
  pepper?: string;
};

function resolvePepper(pepper?: string) {
  const value = pepper ?? process.env.PERSONAL_SAVE_TOKEN_PEPPER;

  if (!value || value.trim().length === 0) {
    throw new Error("PERSONAL_SAVE_TOKEN_PEPPER is missing or invalid.");
  }

  return value.trim();
}

export function hashPersonalSaveToken(token: string, options: PersonalSaveTokenHashOptions = {}) {
  if (!token || token.trim().length === 0) {
    throw new Error("Personal save token is required.");
  }

  const digest = createHmac("sha256", resolvePepper(options.pepper)).update(token).digest("base64url");

  return `${HASH_VERSION}$${digest}`;
}

export function verifyPersonalSaveToken(token: string, storedHash: string, options: PersonalSaveTokenHashOptions = {}) {
  if (!storedHash.startsWith(`${HASH_VERSION}$`)) {
    return false;
  }

  try {
    const expected = Buffer.from(hashPersonalSaveToken(token, options));
    const actual = Buffer.from(storedHash);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function getPersonalSaveTokenPrefix(token: string, visibleChars = DEFAULT_PREFIX_LENGTH) {
  return token.slice(0, visibleChars);
}

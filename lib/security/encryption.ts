import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PAYLOAD_VERSION = "v1";
const IV_BYTE_LENGTH = 12;

export type TokenEncryptionOptions = {
  key?: string;
  // SCA-534 (S-28): symmetric with `legacyPurposes` — optional list of
  // legacy ENCRYPTION_KEY values to try on decrypt when the primary key
  // fails. Encrypt always uses the primary `key` (or process.env.ENCRYPTION_KEY).
  // The rotation runbook is documented in docs/SECURITY.md §
  // "Encryption Key Rotation".
  legacyKeys?: readonly string[];
  // M-8: optional list of legacy AAD purposes to try on decrypt. Encrypt
  // always uses `purpose`; decrypt tries `purpose` first, then each
  // `legacyPurposes` value in order. This unblocks key/AAD rotation without a
  // backfill — old rows decrypt under the old AAD; new rows are written with
  // the new AAD and roll forward naturally.
  legacyPurposes?: readonly string[];
  purpose?: string;
};

// M-9: weak-key heuristic. Length alone (>=32) is not enough — a string of 32
// identical characters trivially passes. Reject keys that have fewer than 16
// distinct characters or whose Shannon entropy is below ~3.0 bits/char.
function approximateShannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function assertEncryptionKeyStrength(value: string) {
  const distinct = new Set(value).size;
  if (distinct < 16) {
    throw new Error("ENCRYPTION_KEY is missing or invalid.");
  }
  if (approximateShannonEntropy(value) < 3.0) {
    throw new Error("ENCRYPTION_KEY is missing or invalid.");
  }
}

function resolveEncryptionSecret(key?: string) {
  const secret = key ?? process.env.ENCRYPTION_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error("ENCRYPTION_KEY is missing or invalid.");
  }

  const trimmed = secret.trim();
  assertEncryptionKeyStrength(trimmed);

  return createHash("sha256").update(trimmed).digest();
}

function encodePart(value: Buffer) {
  return value.toString("base64url");
}

function decodePart(value: string) {
  return Buffer.from(value, "base64url");
}

function aadForPurpose(purpose?: string) {
  return purpose ? Buffer.from(purpose, "utf8") : null;
}

export function encryptToken(plaintext: string, options: TokenEncryptionOptions = {}) {
  if (!plaintext) {
    throw new Error("Token plaintext is required.");
  }

  const key = resolveEncryptionSecret(options.key);
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const aad = aadForPurpose(options.purpose);

  if (aad) {
    cipher.setAAD(aad);
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [TOKEN_PAYLOAD_VERSION, encodePart(iv), encodePart(tag), encodePart(ciphertext)].join(".");
}

export function decryptToken(payload: string, options: TokenEncryptionOptions = {}) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = payload.split(".");

  if (version !== TOKEN_PAYLOAD_VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("Token payload could not be decrypted.");
  }

  const purposesToTry = [options.purpose, ...(options.legacyPurposes ?? [])];
  // SCA-534 (S-28): primary key + each legacyKey in order. AAD rotation and
  // key rotation are independent — every (key, purpose) combination is tried.
  // In practice rotation happens one axis at a time, so this nested loop
  // costs ~2-3 attempts on the worst path during a rotation window.
  const keysToTry = [options.key, ...(options.legacyKeys ?? [])];

  for (const candidateKey of keysToTry) {
    for (const purpose of purposesToTry) {
      try {
        const key = resolveEncryptionSecret(candidateKey);
        const decipher = createDecipheriv("aes-256-gcm", key, decodePart(encodedIv));
        const aad = aadForPurpose(purpose);

        if (aad) {
          decipher.setAAD(aad);
        }

        decipher.setAuthTag(decodePart(encodedTag));

        return Buffer.concat([decipher.update(decodePart(encodedCiphertext)), decipher.final()]).toString("utf8");
      } catch {
        // Try next (key, purpose) combination. Fall through to throw below.
      }
    }
  }

  throw new Error("Token payload could not be decrypted.");
}

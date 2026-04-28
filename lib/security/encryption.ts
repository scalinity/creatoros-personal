import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PAYLOAD_VERSION = "v1";
const IV_BYTE_LENGTH = 12;

export type TokenEncryptionOptions = {
  key?: string;
  purpose?: string;
};

function resolveEncryptionSecret(key?: string) {
  const secret = key ?? process.env.ENCRYPTION_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error("ENCRYPTION_KEY is missing or invalid.");
  }

  return createHash("sha256").update(secret.trim()).digest();
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

  try {
    const key = resolveEncryptionSecret(options.key);
    const decipher = createDecipheriv("aes-256-gcm", key, decodePart(encodedIv));
    const aad = aadForPurpose(options.purpose);

    if (aad) {
      decipher.setAAD(aad);
    }

    decipher.setAuthTag(decodePart(encodedTag));

    return Buffer.concat([decipher.update(decodePart(encodedCiphertext)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Token payload could not be decrypted.");
  }
}

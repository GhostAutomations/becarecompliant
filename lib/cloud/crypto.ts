import "server-only";

/**
 * Be Care Compliant — encrypting the cloud drive access keys at rest (0437).
 *
 * AES-256-GCM with a key held only in the CLOUD_TOKEN_KEY env var (32 random bytes, base64). A
 * stored value is "v1:<iv>:<tag>:<ciphertext>", all base64, so a change of scheme later can be
 * told apart. Without the key nothing can be decrypted, which is the point: a copy of the
 * database alone does not open anybody's SharePoint.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key(): Buffer {
  const raw = process.env.CLOUD_TOKEN_KEY;
  if (!raw) throw new Error("CLOUD_TOKEN_KEY is not set, so cloud drive connections cannot be stored.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CLOUD_TOKEN_KEY must be 32 bytes, base64 encoded.");
  return k;
}

export function cloudKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function openToken(sealed: string): string {
  const [v, iv, tag, enc] = String(sealed).split(":");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("That stored key could not be read.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}

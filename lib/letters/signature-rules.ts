/**
 * Be Care Compliant: the rules for signatures on letters (Phil, 2026-10-12, Job 2 Part A,
 * docs/decisions/letter-signatures.md). The database holds the same role list
 * (may_keep_letter_signature, 0446).
 *
 * Pure and importless so node --test can load it.
 */

/** The logins that keep a "My signature" and can sign letters. */
export const LETTER_SIGNER_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
] as const;

/**
 * Whether this login can keep and use a signature. Never the Founder in support mode: the app
 * treats them as an Admin of the company they manage, so actingAsCompanyId is checked too, and the
 * database refuses them whatever the app says.
 */
export function mayKeepLetterSignature(profile: {
  role: string | null | undefined;
  status?: string | null;
  actingAsCompanyId?: string | null;
}): boolean {
  if (profile.actingAsCompanyId) return false;
  if (profile.status && profile.status !== "active") return false;
  return (LETTER_SIGNER_ROLES as readonly string[]).includes(String(profile.role ?? ""));
}

export type SignatureKind = "upload" | "drawn";
export type SignatureChoice = SignatureKind | "now" | "none";

/** What the letter's signing choice posted. Anything unknown is no signature. */
export function parseSignatureChoice(raw: unknown): SignatureChoice {
  const v = String(raw ?? "");
  return v === "upload" || v === "drawn" || v === "now" ? v : "none";
}

/** An uploaded signature is refused above this (the bucket refuses it too). */
export const MAX_SIGNATURE_BYTES = 1024 * 1024;

/** PNG or JPEG by its first bytes, whatever it is called: the only two a letter PDF can draw. */
export function sniffSignatureImage(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** The base64 inside a drawn signature's PNG data URL, or null when it is not one. */
export function pngDataUrlBase64(raw: unknown): string | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(raw ?? "").trim());
  return m ? m[1] : null;
}

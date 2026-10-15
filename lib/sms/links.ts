import "server-only";
import { randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { LINK_CODE_ALPHABET } from "@/lib/public-forms/config";
import { smsLinkText } from "@/lib/sms/texts";

/**
 * Be Care Compliant: short links for texts (0486, Phil 2026-10-15; docs/decisions/sms-one-segment.md).
 *
 * becarecompliant.com/s/<code> opens a page in the app. The code is 8 characters from the public
 * forms' unambiguous alphabet (31^8, about 850 billion), random, and carries nothing about the
 * person or the company. It runs out when the thing it points to does. Following it only redirects:
 * the page it opens stays behind sign in exactly as before, so the code alone opens nothing.
 */

export const SMS_LINK_LENGTH = 8;
const CODE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${SMS_LINK_LENGTH}}$`);

export function isSmsLinkCode(value: string): boolean {
  return CODE.test(value);
}

function newCode(): string {
  let out = "";
  for (let i = 0; i < SMS_LINK_LENGTH; i += 1) out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  return out;
}

/** Make a short link to a path in the app. Returns how it is written in a text, or null when it
 *  could not be stored (the caller then refuses to send rather than sending a dead link). */
export async function createSmsLink(opts: {
  companyId: string | null;
  targetPath: string;
  expiresAt: string | null;
}): Promise<string | null> {
  if (!opts.targetPath.startsWith("/") || opts.targetPath.startsWith("//")) return null;
  const service = createServiceClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newCode();
    const { error } = await service.from("sms_links").insert({
      code,
      company_id: opts.companyId,
      target_path: opts.targetPath,
      expires_at: opts.expiresAt,
    });
    if (!error) return smsLinkText(code);
    if (error.code !== "23505") {
      console.error("[sms-links] could not store a link:", error.message);
      return null;
    }
  }
  return null;
}

/** Where a code leads, or null when it is unknown or has run out. */
export async function resolveSmsLink(code: string): Promise<string | null> {
  if (!isSmsLinkCode(code)) return null;
  const { data } = await createServiceClient()
    .from("sms_links")
    .select("target_path, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  const expires = data.expires_at as string | null;
  if (expires && Date.parse(expires) < Date.now()) return null;
  const target = data.target_path as string;
  return target.startsWith("/") && !target.startsWith("//") ? target : null;
}

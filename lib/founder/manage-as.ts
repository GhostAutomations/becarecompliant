import "server-only";

/**
 * Be Care Compliant — "manage as company" support mode (Phase 9).
 *
 * The founder (platform admin) already has full cross-company access at the
 * database (every tenant policy allows is_platform_admin). This module adds the
 * APPLICATION-LAYER scoping so the founder can operate inside ONE tenant as its
 * Admin, with a banner, an audit trail and a 30 minute auto-expiry, WITHOUT a
 * second login (single-session login is never touched).
 *
 * Mechanism: a signed, short-lived httpOnly cookie carrying { cid, exp }. The
 * company-scoping guards (requireCompany / requireCompanyAdmin) read it and,
 * only when the real user is a platform admin, return a shadow profile scoped
 * to that company. A non-admin who forges the cookie gets nothing, because the
 * guards check the real role first. Signing + exp make the 30 minute limit
 * tamper-evident and the whole thing fail-closed if the secret is missing.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { actingCompanyGone } from "./manage-as-rules";
import { createHmac, timingSafeEqual } from "crypto";

export const MANAGE_AS_COOKIE = "bcc_manage_as";
export const MANAGE_AS_TTL_SECONDS = 30 * 60; // 30 minutes

function secret(): string | null {
  // Server-only secret, never NEXT_PUBLIC. Present in every deployed env.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a signed token for a company id, valid for MANAGE_AS_TTL_SECONDS. */
export function signManageAs(companyId: string): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + MANAGE_AS_TTL_SECONDS;
  const payload = b64url(JSON.stringify({ cid: companyId, exp }));
  const sig = b64url(createHmac("sha256", key).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify a token and return the company id, or null if invalid/expired. */
export function verifyManageAs(token: string | undefined | null): string | null {
  if (!token) return null;
  const key = secret();
  if (!key) return null; // fail closed
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = b64url(createHmac("sha256", key).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as { cid?: string; exp?: number };
    if (!json.cid || !json.exp) return null;
    if (json.exp * 1000 < Date.now()) return null; // expired
    return json.cid;
  } catch {
    return null;
  }
}

/**
 * The company the founder is currently acting as, or null. Reads the cookie, and CHECKS THE
 * COMPANY IS STILL THERE.
 *
 * DEF-013 (found 2026-08-19, fixed 2026-09-23). Purging Invite Test Ltd erased the company but
 * left this cookie, so the founder went on browsing a tenant that did not exist, under a banner
 * reading "Managing as this company" because there was no name left to show. A signed cookie
 * proves who set it, not that what it points at still exists. So a cookie whose company has been
 * purged, or deleted and waiting out its grace period, now counts as no cookie at all: every
 * reader (the guards, the layout banner, the name lookups, the audit tag) falls back to the
 * founder's own console. deleteCompany and purgeCompanyNow also clear it, but the nightly purge
 * cannot reach the founder's browser, which is why the check lives here.
 *
 * One small query, once per request (cache), with the service client: the id has already been
 * verified as one this server signed, and only a yes or no comes back.
 */
export const readActingCompanyId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const cid = verifyManageAs(store.get(MANAGE_AS_COOKIE)?.value);
  if (!cid) return null;
  const { data } = await createServiceClient()
    .from("companies")
    .select("id, status")
    .eq("id", cid)
    .maybeSingle();
  if (!data || actingCompanyGone((data as { status: string | null }).status)) return null;
  return cid;
});

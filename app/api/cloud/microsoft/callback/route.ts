import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import { openToken, sealToken } from "@/lib/cloud/crypto";
import { exchangeMicrosoftCode, microsoftMe } from "@/lib/cloud/microsoft";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import { forgetCloudStatus } from "@/lib/cloud/queue";
import { readActingCompanyId } from "@/lib/founder/manage-as";

/**
 * Microsoft sends the Admin back here after they sign in (0437). Checked three ways before
 * anything is stored: the state matches the cookie set when they started, the cookie is under
 * ten minutes old, and the person back here is the same Admin of the same company. The keys are
 * then encrypted and stored server side; they never reach the browser. Next step: choose where
 * the folder lives (Settings, Cloud drive).
 */
export const dynamic = "force-dynamic";

const COOKIE = "bcc_ms_oauth";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${siteUrl()}/settings/cloud?${q}`);
  const { user, profile } = await requireCompanyAdmin();
  // Support mode does not connect a company's drive (review, 9 Oct 2026): that is for their Admin.
  if (profile.role === "platform_admin" && (await readActingCompanyId())) return back("error=support");
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/cloud/microsoft" });

  const err = req.nextUrl.searchParams.get("error");
  if (err) {
    // Cancelled, or the company needs its IT admin to approve the app first.
    const desc = req.nextUrl.searchParams.get("error_description") ?? "";
    const needsAdmin = /AADSTS65001|AADSTS90094|admin/i.test(desc) || err === "consent_required";
    return back(`error=${needsAdmin ? "needs_admin" : "cancelled"}`);
  }
  if (!raw) return back("error=expired");

  let saved: { state: string; verifier: string; companyId: string; userId: string; at: number };
  try {
    saved = JSON.parse(openToken(raw));
  } catch {
    return back("error=expired");
  }
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !state || state !== saved.state || Date.now() - saved.at > 10 * 60_000) return back("error=expired");
  if (saved.userId !== user.id || saved.companyId !== profile.company_id) return back("error=expired");

  try {
    const tokens = await exchangeMicrosoftCode(code, saved.verifier);
    // Without a refresh token the connection would stop working within the hour.
    if (!tokens.refreshToken || !tokens.accessToken) return back("error=failed");
    const me = await microsoftMe(tokens.accessToken);
    const db = createServiceClient();

    /* A DIFFERENT ACCOUNT starts from the beginning (review, 9 Oct 2026). Its keys may not reach
       the place the last account chose (another organisation's SharePoint, somebody else's
       OneDrive), and the folders remembered are in that place, so the location and the folders
       are forgotten and the Admin chooses again. The same account reconnecting keeps them. */
    const { data: before } = await db
      .from("cloud_connections")
      .select("id, account_email, drive_id")
      .eq("company_id", saved.companyId)
      .maybeSingle<{ id: string; account_email: string | null; drive_id: string | null }>();
    const sameAccount =
      !!before?.account_email && !!me.email && before.account_email.trim().toLowerCase() === me.email.trim().toLowerCase();
    if (before && before.drive_id && !sameAccount) {
      await db
        .from("cloud_connections")
        .update({ location_kind: null, site_id: null, site_name: null, drive_id: null, root_folder_id: null, root_folder_url: null })
        .eq("id", before.id);
      await db.from("cloud_folders").delete().eq("connection_id", before.id);
      await db.from("cloud_sync_queue").delete().eq("company_id", saved.companyId).eq("status", "done");
      await db
        .from("cloud_sync_queue")
        .update({ status: "pending", claimed_at: null })
        .eq("company_id", saved.companyId)
        .eq("status", "working");
    }

    const { error } = await db.from("cloud_connections").upsert(
      {
        company_id: saved.companyId,
        provider: "microsoft",
        status: "connected",
        account_email: me.email || null,
        account_name: me.name || null,
        refresh_token_enc: sealToken(tokens.refreshToken),
        access_token_enc: sealToken(tokens.accessToken),
        access_token_expires_at: tokens.expiresAt.toISOString(),
        last_error: null,
        last_error_at: null,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    // Copies that waited while it was broken go now.
    await db
      .from("cloud_sync_queue")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("company_id", saved.companyId)
      .eq("status", "pending");
    forgetCloudStatus(saved.companyId);
    await writeAudit({
      companyId: saved.companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "cloud.connected",
      entityType: "cloud_connection",
      entityId: null,
      summary: `Connected Microsoft 365 (${me.email || "account"}) for cloud drive copies`,
    });
    return back("connected=1");
  } catch (e) {
    console.error("[cloud] Microsoft connect failed:", (e as Error).message);
    return back("error=failed");
  }
}

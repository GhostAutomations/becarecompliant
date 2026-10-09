import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { microsoftAuthorizeUrl, microsoftConfigured, newPkce } from "@/lib/cloud/microsoft";
import { cloudKeyConfigured, sealToken } from "@/lib/cloud/crypto";
import { siteUrl } from "@/lib/site";
import { readActingCompanyId } from "@/lib/founder/manage-as";

/**
 * Start connecting Microsoft 365 (0437). An Admin only. Sends them to Microsoft's own sign in
 * screen; the one time values that prove the answer came back to the same person are kept in a
 * short lived, encrypted, http only cookie, never in the URL.
 */
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "bcc_ms_oauth";

export async function GET() {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return NextResponse.redirect(`${siteUrl()}/settings/cloud?error=company`);
  if (profile.role === "platform_admin" && (await readActingCompanyId())) {
    return NextResponse.redirect(`${siteUrl()}/settings/cloud?error=support`);
  }
  if (!microsoftConfigured() || !cloudKeyConfigured()) {
    return NextResponse.redirect(`${siteUrl()}/settings/cloud?error=not_set_up`);
  }
  const pkce = newPkce();
  const jar = await cookies();
  jar.set(
    OAUTH_COOKIE,
    sealToken(
      JSON.stringify({
        state: pkce.state,
        verifier: pkce.verifier,
        companyId: profile.company_id,
        userId: user.id,
        at: Date.now(),
      }),
    ),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/api/cloud/microsoft", maxAge: 600 },
  );
  return NextResponse.redirect(microsoftAuthorizeUrl({ state: pkce.state, challenge: pkce.challenge }));
}

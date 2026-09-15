import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deviceKindFrom } from "@/lib/auth/device-kind";
import { decodeSessionId } from "@/lib/auth/jwt";
import { MANAGE_AS_COOKIE } from "@/lib/founder/manage-as";

/**
 * Verifies a one time token from a branded invite email (sent via Resend) and
 * establishes the session, then sends the user on to set their password.
 * This route is public (see PUBLIC_PATHS: "/auth").
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/welcome";
  const safeNext = next.startsWith("/") ? next : `/${next}`;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?reason=no-access`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?reason=no-access`);
  }

  /*
   * The third way into a session, and it is the one every invited user takes. A manage-as cookie
   * left behind on this browser would otherwise stamp their audit rows as the founder
   * impersonating a tenant (lib/audit.ts), which is a false provenance on a record a regulator
   * reads. Same one line as the sign in and sign out paths.
   */
  (await cookies()).delete(MANAGE_AS_COOKIE);

  /* Claim the slot for THIS kind of device (migration 0273). An invite link is very often
     opened on a phone, and defaulting to the desktop slot would put them in the wrong one: the
     next sign-in from their computer would then evict the phone they had just set up. */
  const sessionId = decodeSessionId(data.session.access_token);
  if (sessionId) {
    await supabase.rpc("claim_session", {
      p_session_id: sessionId,
      p_device_kind: deviceKindFrom(request.headers.get("user-agent")),
    });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}

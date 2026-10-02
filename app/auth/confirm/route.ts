import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deviceKindFrom } from "@/lib/auth/device-kind";
import { decodeSessionId } from "@/lib/auth/jwt";
import { MANAGE_AS_COOKIE } from "@/lib/founder/manage-as";
import { RESET_MARKER_COOKIE, RESET_MARKER_MAX_AGE_SECONDS, makeResetMarker } from "@/lib/auth/reset-marker";
import { INVITE_EXPIRED_PATH, RESET_EXPIRED_PATH } from "@/lib/auth/password-reset-rules";

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
    /* A used or expired RESET link says so and offers a new one, rather than the "no access"
       message an invitation gets, which would read as though their account had been removed. */
    if (type === "recovery") return NextResponse.redirect(`${origin}${RESET_EXPIRED_PATH}`);
    /* AN EXPIRED OR USED INVITATION says so too, and offers a fresh one (Vera, Thistle, 2026-09-30:
       "Contact your administrator" read as though she had no account, and it took the Admin two
       buttons to get her in). */
    if (type === "invite" || type === "magiclink") {
      return NextResponse.redirect(`${origin}${INVITE_EXPIRED_PATH}`);
    }
    return NextResponse.redirect(`${origin}/login?reason=no-access`);
  }

  /*
   * The third way into a session, and it is the one every invited user takes. A manage-as cookie
   * left behind on this browser would otherwise stamp their audit rows as the founder
   * impersonating a tenant (lib/audit.ts), which is a false provenance on a record a regulator
   * reads. Same one line as the sign in and sign out paths.
   */
  (await cookies()).delete(MANAGE_AS_COOKIE);

  /* DEF-105: mark a session made by a RESET link, because Supabase records its amr as "otp", the
     same as a sign in link, and the reset form could not tell them apart (lib/auth/reset-marker). */
  if (type === "recovery") {
    const sid = decodeSessionId(data.session.access_token);
    const marker = sid ? await makeResetMarker(sid) : null;
    if (!marker) return NextResponse.redirect(`${origin}${RESET_EXPIRED_PATH}`);
    (await cookies()).set(RESET_MARKER_COOKIE, marker, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: RESET_MARKER_MAX_AGE_SECONDS,
    });
  }

  /* Claim the slot for THIS kind of device (migration 0273). An invite link is very often
     opened on a phone, and defaulting to the desktop slot would put them in the wrong one: the
     next sign-in from their computer would then evict the phone they had just set up. */
  const sessionId = decodeSessionId(data.session.access_token);
  /* A RESET LINK DOES NOT TAKE A SLOT (2026-09-23). Its session can only reach the new password
     form, and claiming a slot here would sign out the person's real phone or computer the moment
     they tapped the email, before they had changed anything. Saving the password ends every
     session anyway, and the next real sign in claims its slot as normal. */
  if (sessionId && type !== "recovery") {
    await supabase.rpc("claim_session", {
      p_session_id: sessionId,
      p_device_kind: deviceKindFrom(request.headers.get("user-agent")),
    });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}

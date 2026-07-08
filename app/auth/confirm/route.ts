import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";

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

  // Single-session: make this the active session.
  const sessionId = decodeSessionId(data.session.access_token);
  if (sessionId) {
    await supabase.rpc("claim_session", { p_session_id: sessionId });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}

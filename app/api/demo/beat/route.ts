import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";
import { demoAreaFor } from "@/lib/demo/rules";

/**
 * DEMO USAGE BEAT (0356, Phil: active time only). The demo layout posts here about every 30
 * seconds while the tab is visible and somebody has used it in the last minute. The sign in (the
 * Supabase session id) is taken from the token here, never from the request body, and the
 * database caps each beat by the real time since the last one. For anybody who is not a demo
 * login it does nothing at all.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sid = session ? decodeSessionId(session.access_token) : null;
  if (!sid) return new Response(null, { status: 204 });

  let path = "/";
  let seconds = 0;
  try {
    const body = (await request.json()) as { path?: unknown; seconds?: unknown };
    if (typeof body.path === "string") path = body.path.slice(0, 300);
    if (typeof body.seconds === "number" && Number.isFinite(body.seconds)) seconds = Math.round(body.seconds);
  } catch {
    return new Response(null, { status: 400 });
  }
  await supabase.rpc("demo_beat", { p_session: sid, p_area: demoAreaFor(path), p_seconds: Math.max(0, Math.min(60, seconds)) });
  return new Response(null, { status: 204 });
}

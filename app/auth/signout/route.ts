import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MANAGE_AS_COOKIE } from "@/lib/founder/manage-as";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  /*
   * The manage-as cookie outlived the session that earned it. It lasts 30 minutes and only
   * exitManageAs deleted it, so if the founder signed out without leaving the tenant first, the
   * next person to sign in on that browser inherited it: their audit rows were stamped
   * "impersonating, platform_admin" (lib/audit.ts) and every colleague name lookup asked about
   * the wrong company. Signing out ends it.
   */
  (await cookies()).delete(MANAGE_AS_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}

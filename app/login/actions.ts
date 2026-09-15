"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MANAGE_AS_COOKIE } from "@/lib/founder/manage-as";
import { decodeSessionId } from "@/lib/auth/jwt";
import type { LoginState } from "@/lib/auth/types";
import { afterSignIn } from "@/lib/auth/safe-next";

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return { error: "Email or password is incorrect." };
  }

  // Belt and braces with the sign out route: a manage-as cookie left on this browser by the
  // founder must not follow whoever signs in next. Only the founder can obtain one.
  (await cookies()).delete(MANAGE_AS_COOKIE);

  // Single-session: claiming this session invalidates any other device.
  const sessionId = decodeSessionId(data.session.access_token);
  if (sessionId) {
    const { error: claimError } = await supabase.rpc("claim_session", {
      p_session_id: sessionId,
    });
    if (claimError) {
      await supabase.auth.signOut();
      return { error: "Could not start your session. Please try again." };
    }
  }

  /*
   * Back to whatever they were trying to open, or the Dashboard when there was nothing.
   *
   * Re-validated rather than trusted: `next` reaches here as a form field, which anyone can
   * edit, and following it unchecked would turn the sign-in screen into an open redirect.
   * safeNext also strips any query string, so this redirect stays clear of the Next.js 15
   * Server Action redirect bug the rest of the codebase works around.
   */
  redirect(afterSignIn(String(formData.get("next") ?? "")));
}

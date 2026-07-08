"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";
import type { LoginState } from "@/lib/auth/types";

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

  redirect("/dashboard");
}

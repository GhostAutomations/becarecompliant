"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MANAGE_AS_COOKIE } from "@/lib/founder/manage-as";
import { decodeSessionId } from "@/lib/auth/jwt";
import type { LoginState } from "@/lib/auth/types";
import { afterSignIn } from "@/lib/auth/safe-next";
import { deviceKindFrom } from "@/lib/auth/device-kind";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { sendPasswordReset } from "@/lib/auth/password-reset";
import {
  FORGOT_REPLY,
  amrFromAccessToken,
  cameFromRecovery,
  newPasswordProblem,
} from "@/lib/auth/password-reset-rules";
import type { ActionState } from "@/lib/forms";

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

  /* One desktop session and one mobile session (migration 0273). Claiming a slot invalidates
     only the other device OF THE SAME KIND, so signing in on a phone no longer signs the person
     out of their own computer. */
  const sessionId = decodeSessionId(data.session.access_token);
  if (sessionId) {
    const { error: claimError } = await supabase.rpc("claim_session", {
      p_session_id: sessionId,
      p_device_kind: deviceKindFrom((await headers()).get("user-agent")),
    });
    if (claimError) {
      // Only the session this sign in just made. Their other device did nothing wrong.
      await supabase.auth.signOut({ scope: "local" });
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

/**
 * "Forgot your password?" (2026-09-23). Public: no session.
 *
 * ONE ANSWER FOR EVERY OUTCOME. Whether the address has an account, has none, is switched off or
 * was sent one a minute ago, the page says the same sentence, so the form cannot be used to find
 * out who works at a care company. What actually happened is in the audit trail and the logs.
 */
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email address you sign in with." };
  try {
    const outcome = await sendPasswordReset({ email });
    if (!outcome.sent && (outcome.reason === "failed" || outcome.reason === "email_not_configured")) {
      // Not shown to the public, but never silent: this is a locked out user with no email coming.
      console.error("[password-reset] not sent:", outcome.reason, outcome.detail ?? "");
    }
  } catch (e) {
    console.error("[password-reset] threw:", (e as Error).message);
  }
  return { ok: FORGOT_REPLY };
}

/**
 * Set a new password, reached from the reset email via /auth/confirm, which has already checked
 * the one time token and signed them in.
 *
 * SIGNED OUT EVERYWHERE ELSE (Phil, popup 2026-09-23). A reset is often because somebody else may
 * know the old password. Two things end the other sessions, because either alone leaves a gap:
 * Supabase revokes their refresh tokens, and the app's own session slots are cleared down to this
 * one, so the other device is turned away on its very next page rather than when its access token
 * happens to run out.
 */
export async function setNewPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Ask for a new one from the sign in page." };

  /* The same test as the page, because a form post does not have to come from the page: only a
     session that has just come from a reset link may set a password without the old one. */
  const {
    data: { session: current },
  } = await supabase.auth.getSession();
  if (!current || !cameFromRecovery(amrFromAccessToken(current.access_token), Date.now())) {
    return { error: "This reset has expired. Ask for a new link from the sign in page." };
  }

  const problem = newPasswordProblem(
    String(formData.get("password") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (problem) return { error: problem };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, company_id, email, role, status")
    .eq("id", user.id)
    .maybeSingle();
  // The page turns them away too, but a form post does not have to come from the page.
  if (!profile || profile.status !== "active") {
    return { error: "This account cannot set a password here. Contact your administrator." };
  }

  const admin = createServiceClient();
  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
    password: String(formData.get("password")),
  });
  if (pwErr) return { error: `Your password could not be changed: ${pwErr.message}` };

  // 1. Supabase: revoke every other session's refresh token.
  await supabase.auth.signOut({ scope: "others" });

  // 2. The app's own slots: all of them. This session is about to end too (step 3), and an empty
  //    slot table is fine: the next real sign in claims its slot as it always does.
  await admin.from("user_sessions").delete().eq("user_id", user.id);

  await writeAudit({
    companyId: (profile.company_id as string | null) ?? null,
    actorId: user.id,
    actorEmail: profile.email as string,
    actorRole: profile.role as string,
    action: "password.reset_completed",
    entityType: "profile",
    entityId: user.id,
    summary: "Set a new password from a reset link and signed out everywhere else",
  });

  /*
   * 3. END THE RESET SESSION TOO (Phil, popup 2026-09-23). It came from an email link and was only
   * ever allowed to reach this form. They sign in fresh with the new password, which is also the
   * moment a phone or browser offers to save it.
   */
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?reason=password-changed");
}

import "server-only";

/**
 * Be Care Compliant - send a password reset email. One door for both routes in: the public
 * "Forgot your password?" form and the Admin's "Send password reset" button (2026-09-23).
 *
 * THE LINK IS OURS, NOT SUPABASE'S. generateLink makes the one time recovery token and we put its
 * hash into our own /auth/confirm URL, exactly as invitations do, so the email goes out through
 * Resend with the branded button and the token is checked server side. The confirm route then
 * signs them in and sends them to set a new password.
 *
 * It never says, to the caller, whether an address exists: the public form shows one sentence
 * for every outcome (FORGOT_REPLY). The Admin button is told the reason, because the Admin can
 * already see the person in their own list.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, isSendableAddress, resendConfigured } from "@/lib/email/resend";
import { passwordResetEmailHtml, passwordResetSubject } from "@/lib/email/templates";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import {
  RESET_FORM_PATH,
  canReceiveReset,
  looksLikeEmail,
  normaliseEmail,
  resetThrottled,
} from "@/lib/auth/password-reset-rules";

export type ResetOutcome =
  | { sent: true; email: string }
  | {
      sent: false;
      reason: "no_account" | "not_active" | "throttled" | "unsendable" | "email_not_configured" | "failed";
      detail?: string;
    };

export async function sendPasswordReset(opts: {
  email: string;
  /** Present when an Admin pressed the button. Absent for the public form. */
  sentBy?: { id: string; name: string; email: string; role: string; companyId: string } | null;
}): Promise<ResetOutcome> {
  const email = normaliseEmail(opts.email);
  if (!looksLikeEmail(email)) return { sent: false, reason: "no_account" };

  /* NOT CONFIGURED IS SAID OUT LOUD. sendEmail quietly skips when Resend is missing, and a reset
     that silently never arrives is a locked out manager with nothing to go on. */
  if (!resendConfigured()) return { sent: false, reason: "email_not_configured" };

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, company_id, full_name, email, status, role")
    // eq, not ilike: an underscore in an address is a wildcard to ilike, so "a_b@x" would match
    // "axb@x". Addresses are stored lower case by every door that writes them.
    .eq("email", email)
    .maybeSingle();
  if (!profile) return { sent: false, reason: "no_account" };
  if (!canReceiveReset(profile.status as string)) return { sent: false, reason: "not_active" };
  if (!isSendableAddress(email)) return { sent: false, reason: "unsendable" };

  /* THROTTLED ON THE AUDIT TRAIL. Every reset sent is written there anyway, so the last one is
     one indexed read away, and it holds for the Founder's own account too, which has no company
     and so no row in the notification log. Without it the public form is a way to fill somebody's
     inbox. */
  const { data: last } = await admin
    .from("audit_log")
    .select("created_at")
    .eq("entity_type", "profile")
    .eq("entity_id", profile.id)
    .eq("action", "password.reset_sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  /* AN ADMIN IS NEVER HELD BACK (Phil, 2026-09-23). The wait exists so a stranger cannot use the
     public form to fill somebody's inbox; an Admin in Settings is not a stranger. */
  if (!opts.sentBy && resetThrottled((last as { created_at?: string } | null)?.created_at, Date.now())) {
    return { sent: false, reason: "throttled" };
  }

  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) {
    return { sent: false, reason: "failed", detail: link.error?.message ?? "No reset token was made." };
  }
  const url = new URL(`${siteUrl()}/auth/confirm`);
  url.searchParams.set("token_hash", hash);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", RESET_FORM_PATH);

  const result = await sendEmail({
    to: email,
    subject: passwordResetSubject(),
    html: passwordResetEmailHtml({
      recipientName: (profile.full_name as string) || email,
      actionUrl: url.toString(),
      sentByName: opts.sentBy?.name ?? null,
    }),
  });
  if (!result.sent) {
    return {
      sent: false,
      reason: result.skippedReason ? "email_not_configured" : "failed",
      detail: result.error ?? result.skippedReason,
    };
  }

  await writeAudit({
    companyId: (profile.company_id as string | null) ?? opts.sentBy?.companyId ?? null,
    actorId: opts.sentBy?.id ?? null,
    actorEmail: opts.sentBy?.email ?? null,
    actorRole: opts.sentBy?.role ?? null,
    action: "password.reset_sent",
    entityType: "profile",
    entityId: profile.id as string,
    summary: opts.sentBy
      ? `Sent a password reset to ${email}`
      : `Password reset requested for ${email} from the sign in page`,
    metadata: { by_admin: Boolean(opts.sentBy) },
  });
  return { sent: true, email };
}

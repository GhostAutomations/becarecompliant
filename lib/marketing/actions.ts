"use server";

/**
 * Public "start free trial" lead capture. This action is reachable WITHOUT auth
 * (the marketing pages are public), so it never trusts the caller: it validates the
 * input, writes through the service-role client (the trial_requests table has no
 * anonymous RLS insert), then notifies the founder and acknowledges the applicant by
 * email. It is founder-led on purpose: a request creates a lead, not a live tenant.
 */

import { headers } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { type ActionState } from "@/lib/forms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: FormDataEntryValue | null, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function submitTrialRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company_name = clean(formData.get("company_name"), 200);
  const contact_name = clean(formData.get("contact_name"), 200);
  const email = clean(formData.get("email"), 200).toLowerCase();
  const phone = clean(formData.get("phone"), 60) || null;
  const tier_interest = clean(formData.get("tier_interest"), 40) || null;
  const team_size = clean(formData.get("team_size"), 60) || null;
  const message = clean(formData.get("message"), 2000) || null;
  // Honeypot: bots fill hidden fields. If present, silently succeed without storing.
  const trap = clean(formData.get("website_url"), 200);

  if (!company_name || !contact_name || !email) {
    return { error: "Please give your company name, your name and an email." };
  }
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  if (trap) return { ok: "Thanks, we will be in touch shortly." };

  const supabase = createServiceClient();

  // Rate limit so a bot that skips the honeypot cannot flood the founder's leads.
  // Keyed on a hash of the caller IP (no IP is ever stored), the same helper and
  // 5-per-10-minutes window the public compliance forms use.
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rateKey = createHash("sha256").update(`${ip}:trial-request`).digest("hex");
  const { data: rateOk, error: rateError } = await supabase.rpc("public_form_rate_ok", {
    p_key: rateKey,
    p_limit: 5,
    p_window_minutes: 10,
  });
  if (rateError) {
    return { error: "Something went wrong. Please try again, or email hello@becarecompliant.com." };
  }
  if (rateOk === false) {
    return {
      error: "You have sent several requests in a short time. Please wait a few minutes and try again.",
    };
  }

  const { data: inserted, error } = await supabase
    .from("trial_requests")
    .insert({
      company_name,
      contact_name,
      email,
      phone,
      tier_interest,
      team_size,
      message,
      source: "website",
    })
    .select("id")
    .single();
  if (error) return { error: "Something went wrong. Please try again, or email hello@becarecompliant.com." };
  const requestId = (inserted as { id: string } | null)?.id ?? null;

  /* WHETHER THE FOUNDER WAS TOLD IS NOW A FACT ON THE ROW.
     Two real companies asked for a trial on 27 Aug 2026 and sat unanswered for six days. The
     alert was attempted here and then forgotten: nothing recorded that it left, nothing
     recorded when it did not. A lead is the one thing on this platform that costs money when
     it is late, so it gets the same treatment the product gives an overdue supervision —
     proof of delivery, and a chase until somebody deals with it (api/cron/trial-chase). */
  let alertedAt: string | null = null;
  let alertError: string | null = null;

  // Notify the founder(s). Never blocks the submission if email is unconfigured.
  if (!resendConfigured()) {
    alertError = "Email is not configured on this deployment (RESEND_API_KEY / RESEND_FROM).";
  }
  if (resendConfigured()) {
    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .eq("role", "platform_admin");
    const rows = [
      ["Company", company_name],
      ["Contact", contact_name],
      ["Email", email],
      ["Phone", phone ?? "Not given"],
      ["Interested in", tier_interest ?? "Not sure yet"],
      ["Team size", team_size ?? "Not given"],
      ["Message", message ?? "None"],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#8b93a7;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#e9ecf5;">${escapeHtml(v)}</td></tr>`,
      )
      .join("");
    const bodyHtml = `<p>A new free trial request came in from the website.</p><table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
    const html = noticeEmailHtml({
      preheader: `New trial request from ${company_name}`,
      heading: "New free trial request",
      bodyHtml,
      ctaLabel: "Open the founder console",
      ctaUrl: `${siteUrl()}/founder`,
      footerNote: "You receive this because you are the platform admin for Be Care Compliant.",
    });
    const recipients = ((admins as Array<{ email: string | null }> | null) ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));

    if (recipients.length === 0) {
      // A platform with nobody to tell is a configuration fault, not a quiet success.
      alertError = "No platform admin has an email address on their profile.";
    }
    const failures: string[] = [];
    for (const to of recipients) {
      const result = await sendEmail({
        to,
        subject: `New trial request: ${company_name}`,
        html,
        replyTo: email,
      });
      if (result.sent) alertedAt = new Date().toISOString();
      else failures.push(result.error ?? result.skippedReason ?? "Unknown send failure");
    }
    /* Recorded even when ANOTHER admin's copy went: "one of you got it" is not the same as
       "you got it", and the console must not imply it was. */
    if (failures.length > 0) alertError = failures.join("; ").slice(0, 500);

    // Acknowledge the applicant (no app CTA: they have no account yet).
    const ackHtml = noticeEmailHtml({
      preheader: "We have your Be Care Compliant trial request",
      heading: "Thanks, we have your request",
      bodyHtml: `<p>Hi ${escapeHtml(contact_name)},</p><p>Thanks for your interest in Be Care Compliant. We have received your request to start a 14 day trial for ${escapeHtml(company_name)} and will be in touch shortly to set you up.</p><p>If you need anything in the meantime, just reply to this email.</p>`,
      footerNote: "You receive this because you requested a Be Care Compliant trial.",
    });
    await sendEmail({ to: email, subject: "Your Be Care Compliant trial request", html: ackHtml });
  }

  /* Best effort, and deliberately AFTER the applicant has been served: a failure to record the
     alert must never turn a captured lead into an error on their screen. */
  if (requestId) {
    await supabase
      .from("trial_requests")
      .update({ founder_alerted_at: alertedAt, founder_alert_error: alertedAt ? null : alertError })
      .eq("id", requestId);
  }

  return { ok: "Thanks, we have your request. We will be in touch shortly to set up your 14 day trial." };
}

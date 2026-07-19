"use server";

/**
 * Public "start free trial" lead capture. This action is reachable WITHOUT auth
 * (the marketing pages are public), so it never trusts the caller: it validates the
 * input, writes through the service-role client (the trial_requests table has no
 * anonymous RLS insert), then notifies the founder and acknowledges the applicant by
 * email. It is founder-led on purpose: a request creates a lead, not a live tenant.
 */

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
  const { error } = await supabase.from("trial_requests").insert({
    company_name,
    contact_name,
    email,
    phone,
    tier_interest,
    team_size,
    message,
    source: "website",
  });
  if (error) return { error: "Something went wrong. Please try again, or email hello@becarecompliant.com." };

  // Notify the founder(s). Never blocks the submission if email is unconfigured.
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
    for (const a of (admins as Array<{ email: string | null }> | null) ?? []) {
      if (a.email) await sendEmail({ to: a.email, subject: `New trial request: ${company_name}`, html, replyTo: email });
    }

    // Acknowledge the applicant (no app CTA: they have no account yet).
    const ackHtml = noticeEmailHtml({
      preheader: "We have your Be Care Compliant trial request",
      heading: "Thanks, we have your request",
      bodyHtml: `<p>Hi ${escapeHtml(contact_name)},</p><p>Thanks for your interest in Be Care Compliant. We have received your request to start a 14 day trial for ${escapeHtml(company_name)} and will be in touch shortly to set you up.</p><p>If you need anything in the meantime, just reply to this email.</p>`,
      footerNote: "You receive this because you requested a Be Care Compliant trial.",
    });
    await sendEmail({ to: email, subject: "Your Be Care Compliant trial request", html: ackHtml });
  }

  return { ok: "Thanks, we have your request. We will be in touch shortly to set up your 14 day trial." };
}

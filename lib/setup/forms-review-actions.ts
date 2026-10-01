"use server";

/**
 * "Are you happy with your forms set up?" (Phil, 2026-10-01). Asked as a Company Admin leaves the
 * Forms page while the Getting set up step is still open. Yes ticks the step; No asks what they
 * need and emails the founder, when the founder set the company up (provisioned_by). Nothing here
 * changes a form, so nothing ever moves to v2 to tick a box.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordSetupDone } from "@/lib/setup/status";
import { sendEmail, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { writeAudit } from "@/lib/audit";

export async function formsReviewHappy(): Promise<{ ok?: true; error?: string }> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  await recordSetupDone(profile.company_id, "forms", user.id);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function formsReviewNeedsHelp(
  message: string,
): Promise<{ ok?: string; error?: string }> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  const text = String(message ?? "").trim();
  if (text.length < 3) return { error: "Tell us what you need, in a few words." };
  if (text.length > 2000) return { error: "Please keep it to 2000 characters or fewer." };

  const admin = createServiceClient();
  const [{ data: co }, { data: founders }] = await Promise.all([
    admin.from("companies").select("name, provisioned_by").eq("id", companyId).maybeSingle(),
    admin.from("profiles").select("email").eq("role", "platform_admin"),
  ]);
  const company = co as { name: string; provisioned_by: string | null } | null;
  if (!company) return { error: "The company could not be found." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "setup.forms_help_requested",
    entityType: "company",
    entityId: companyId,
    summary: "Asked for help with the forms set up",
    metadata: { message: text },
  });

  // Only a company the founder set up has a founder to tell.
  if (!company.provisioned_by) {
    return { ok: "Thank you. Your note has been recorded." };
  }
  if (!resendConfigured()) {
    console.error("[setup] forms help request not emailed: RESEND_API_KEY / RESEND_FROM not configured");
    return { error: "Your note could not be emailed just now. Please email Be Care Compliant directly." };
  }

  const who = profile.full_name || profile.email;
  const html = noticeEmailHtml({
    preheader: `${company.name} needs help with their forms`,
    heading: `${company.name} needs help with their forms`,
    bodyHtml: `<p>${escapeHtml(who)} (${escapeHtml(profile.email)}) is not yet happy with their forms set up. They wrote:</p><p style="white-space:pre-wrap;border-left:3px solid #f5b544;padding-left:12px;">${escapeHtml(text)}</p>`,
    ctaLabel: "Open the company",
    ctaUrl: `${siteUrl()}/founder/companies/${companyId}`,
    footerNote: "You receive this because you are the platform admin for Be Care Compliant.",
  });
  const recipients = ((founders as Array<{ email: string | null }> | null) ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  let sent = 0;
  for (const to of recipients) {
    const r = await sendEmail({ to, subject: `Forms help: ${company.name}`, html, replyTo: profile.email || undefined });
    if (r.sent) sent += 1;
    else console.error("[setup] forms help email not sent:", r.error ?? r.skippedReason);
  }
  if (!sent) return { error: "Your note could not be emailed just now. Please email Be Care Compliant directly." };
  return { ok: "Thank you. Be Care Compliant has your note and will be in touch." };
}

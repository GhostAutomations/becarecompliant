import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail, isSendableAddress, resendConfigured } from "@/lib/email/resend";
import { noticeEmailHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import { purgeCompany } from "@/lib/companies/delete-apply";
import { writeAudit } from "@/lib/audit";
import { DEMO_AI_PER_LOGIN, demoPhase, friendlyLoginError } from "@/lib/demo/rules";

/**
 * DEMO ACCOUNTS, the server side (0356). Everything here runs with the service client and is
 * reached only from the founder's own actions (requirePlatformAdmin) or the cron (CRON_SECRET).
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type DemoLoginInput = { demoId: string; companyId: string; fullName: string; email: string; password: string };

/** Check a login's details before anything is created. Null when they are fine. */
export async function demoLoginProblem(input: { fullName: string; email: string; password: string }): Promise<string | null> {
  if (!input.fullName.trim()) return "Enter the name of the person the demo is for.";
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return "Enter a valid email address for the login.";
  if (!isSendableAddress(email)) return "That is a test or sample address. Use the client's real email.";
  if (input.password.length < 8) return "Choose a password of at least 8 characters.";
  const admin = createServiceClient();
  const { data } = await admin.from("profiles").select("id").eq("email", email).limit(1);
  if ((data ?? []).length > 0) {
    return "That email already has a Be Care Compliant login, and one email can only have one login. Use another address, for example name+demo@their-company.co.uk.";
  }
  return null;
}

/**
 * Step 1 of a demo login: the sign-in account itself, with the password the founder chose,
 * confirmed so it signs straight in. Done first, so a refused password (too weak, leaked online)
 * stops the founder before anything else is built.
 */
export async function createDemoUser(input: { fullName: string; email: string; password: string }): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  });
  if (error || !created.user) return { ok: false, error: friendlyLoginError(error?.message ?? null) };
  return { ok: true, userId: created.user.id };
}

/** Remove a sign-in account made by createDemoUser when the rest of the set up did not happen. */
export async function discardDemoUser(userId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.auth.admin.deleteUser(userId);
}

/**
 * Step 2: make the account a Company Admin of the demo company, active, and record it with its
 * 5 AI credits. On failure the account is removed, so nothing is left half made.
 */
export async function attachDemoLogin(input: { demoId: string; companyId: string; userId: string; fullName: string; email: string }): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ company_id: input.companyId, role: "company_admin", status: "active", full_name: fullName, email })
    .eq("id", input.userId);
  if (profileErr) {
    await discardDemoUser(input.userId);
    return { ok: false, error: `The login could not be attached to the demo: ${profileErr.message}` };
  }
  const { error: rowErr } = await admin.from("demo_logins").insert({
    demo_id: input.demoId,
    user_id: input.userId,
    email,
    full_name: fullName,
    ai_allowance: DEMO_AI_PER_LOGIN,
  });
  if (rowErr) {
    await discardDemoUser(input.userId);
    return { ok: false, error: `The login could not be recorded: ${rowErr.message}` };
  }
  return { ok: true, userId: input.userId };
}

/** Make one demo login in one go (used when adding a login to an existing demo). */
export async function createDemoLogin(input: DemoLoginInput): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const made = await createDemoUser(input);
  if (!made.ok) return made;
  return attachDemoLogin({ demoId: input.demoId, companyId: input.companyId, userId: made.userId, fullName: input.fullName, email: input.email });
}

/**
 * Delete a demo company now: logins, records, files, all of it, through the same purge every
 * deleted company goes through. The demo record itself stays, with its usage and feedback, so the
 * founder can still see how it went.
 */
export async function purgeDemo(demoId: string, by: "founder" | "cron"): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceClient();
  const { data: demo } = await admin.from("demos").select("id, company_id, client_name, deleted_at").eq("id", demoId).maybeSingle();
  if (!demo) return { ok: false, error: "That demo no longer exists." };
  if (demo.deleted_at) return { ok: true };
  const companyId = demo.company_id as string | null;
  if (companyId) {
    const { error: markErr } = await admin
      .from("companies")
      .update({ status: "deleted", deleted_at: new Date().toISOString(), purge_after: new Date().toISOString() })
      .eq("id", companyId);
    if (markErr) return { ok: false, error: `Could not close the demo company: ${markErr.message}` };
    const purged = await purgeCompany({ companyId, actor: null, by, force: true });
    if (!purged.ok) return { ok: false, error: purged.error };
  }
  await admin.from("demos").update({ deleted_at: new Date().toISOString() }).eq("id", demoId);
  await writeAudit({
    companyId: null,
    actorId: null,
    actorEmail: null,
    actorRole: by === "cron" ? "system" : "platform_admin",
    action: "demo.deleted",
    entityType: "demo",
    entityId: demoId,
    summary: `Deleted the demo for ${demo.client_name as string}`,
    metadata: { by },
  });
  return { ok: true };
}

/**
 * THE DAILY DEMO HOUSEKEEPING (cron). Idempotent, so running it twice sends nothing twice:
 * 1. A demo that has ended and has not been emailed: every login that has not answered the survey
 *    gets one email with a button to it, then the demo is marked emailed.
 * 2. A demo 14 days past its end is deleted.
 */
export async function runDemoHousekeeping(): Promise<{ emailed: number; deleted: number; errors: string[] }> {
  const admin = createServiceClient();
  const errors: string[] = [];
  let emailed = 0;
  let deleted = 0;
  const { data: demos, error } = await admin
    .from("demos")
    .select("id, client_name, ends_at, feedback_emailed_at")
    .is("deleted_at", null)
    .lte("ends_at", new Date().toISOString());
  if (error) return { emailed, deleted, errors: [`could not list demos: ${error.message}`] };

  for (const d of (demos ?? []) as Array<{ id: string; client_name: string; ends_at: string; feedback_emailed_at: string | null }>) {
    if (demoPhase(d.ends_at) === "purge_due") {
      const out = await purgeDemo(d.id, "cron");
      if (out.ok) deleted += 1;
      else errors.push(`demo ${d.id}: ${out.error}`);
      continue;
    }
    if (d.feedback_emailed_at) continue;
    if (!resendConfigured()) {
      errors.push("RESEND_API_KEY / RESEND_FROM not configured, so no demo survey emails were sent");
      break;
    }
    const { data: logins } = await admin.from("demo_logins").select("id, email, full_name").eq("demo_id", d.id);
    let allSent = true;
    for (const l of (logins ?? []) as Array<{ id: string; email: string; full_name: string }>) {
      await admin.from("demo_feedback").upsert({ demo_id: d.id, login_id: l.id }, { onConflict: "login_id", ignoreDuplicates: true });
      const { data: fb } = await admin.from("demo_feedback").select("token, submitted_at").eq("login_id", l.id).maybeSingle();
      if (!fb || fb.submitted_at) continue;
      const first = (l.full_name || "").split(" ")[0] || "there";
      const sent = await sendEmail({
        to: l.email,
        subject: "How was your Be Care Compliant demo?",
        html: noticeEmailHtml({
          preheader: "Two minutes, seven scores and three short questions.",
          heading: `Thank you for trying Be Care Compliant, ${first}`,
          bodyHtml:
            "<p>Your demo has now ended. We would love to know what you thought: what you liked, what you did not, and what we could do better. It takes about two minutes.</p>",
          ctaLabel: "Tell us what you thought",
          ctaUrl: `${siteUrl()}/demo-feedback/${fb.token as string}?from=email`,
          footerNote: "You receive this email because you had a demo of Be Care Compliant.",
        }),
      });
      if (sent.sent) emailed += 1;
      else {
        allSent = false;
        errors.push(`demo ${d.id} survey to ${l.email}: ${sent.error ?? sent.skippedReason ?? "not sent"}`);
      }
    }
    if (allSent) await admin.from("demos").update({ feedback_emailed_at: new Date().toISOString() }).eq("id", d.id);
  }
  return { emailed, deleted, errors };
}

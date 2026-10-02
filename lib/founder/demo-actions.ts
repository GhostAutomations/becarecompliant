"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { rebakeFormFieldOptions } from "@/lib/forms/rebake-options";
import type { ActionState } from "@/lib/forms";
import { DEMO_COMPANY_NAME, demoEndsAt, demoPhase, parseDemoDays } from "@/lib/demo/rules";
import { attachDemoLogin, createDemoLogin, createDemoUser, demoLoginProblem, discardDemoUser, markDemoLoginWaiting, purgeDemo } from "@/lib/demo/manage";
import { finishDemoPolicies } from "@/lib/demo/policies";
import { sendDemoLoginEmail } from "@/lib/demo/login-email";

/**
 * FOUNDER > DEMOS (0356, Phil 2026-09-30). A fresh Demo Care Company Limited per client, filled
 * with made up data, with a login, running for the days he sets (7 by default). Only the founder
 * can make, extend, end or delete one. The client chooses their own password from a one time link
 * in the login email (Phil, 2026-10-02): the founder never sets or sees it.
 */

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createDemo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const clientName = field(formData, "client_name");
  const fullName = field(formData, "full_name");
  const email = field(formData, "email").toLowerCase();
  const days = parseDemoDays(field(formData, "days"));

  if (!clientName) return { error: "Enter who the demo is for (their company or name)." };
  if (clientName.length > 120) return { error: "Keep the client name to 120 characters." };
  if (!days.ok) return { error: days.error };
  const problem = await demoLoginProblem({ fullName, email });
  if (problem) return { error: problem };

  // The sign-in account first: if it is refused, nothing else has been built and the founder's
  // form keeps everything they typed.
  const account = await createDemoUser({ fullName, email });
  if (!account.ok) return { error: account.error };

  const supabase = await createClient();
  const slug = `demo-${randomBytes(4).toString("hex")}`;
  const { data: result, error } = await supabase.rpc("provision_company", {
    p_name: DEMO_COMPANY_NAME,
    p_slug: slug,
    p_tier: "pro",
    p_branch_name: "Cardiff",
    p_trial_days: 0,
    p_owner_email: null,
    p_owner_domain: null,
    p_request_id: null,
    p_override_reason: null,
  });
  if (error) {
    await discardDemoUser(account.userId);
    return { error: error.message };
  }
  const companyId = (result as { company_id?: string } | null)?.company_id;
  if (!companyId) {
    await discardDemoUser(account.userId);
    return { error: "The demo company was not created, so nothing has changed. Try again." };
  }

  // A demo is never billed, counted in revenue or listed with the customers.
  await supabase.from("companies").update({ is_test: true, regulator: "ciw" }).eq("id", companyId);

  const endsAt = demoEndsAt(days.days);
  const { data: demo, error: demoErr } = await supabase
    .from("demos")
    .insert({
      company_id: companyId,
      client_name: clientName,
      contact_email: email,
      ends_at: endsAt.toISOString(),
      created_by: user.id,
      trial_request_id: /^[0-9a-f-]{36}$/i.test(field(formData, "trial_request_id")) ? field(formData, "trial_request_id") : null,
    })
    .select("id")
    .single();
  if (demoErr || !demo) {
    await discardDemoUser(account.userId);
    return { error: `The demo could not be recorded: ${demoErr?.message ?? "unknown"}` };
  }

  // The login is attached BEFORE the sample data, because the planner bookings in it are given to
  // the demo login and only somebody in the company can be given a booking.
  const login = await attachDemoLogin({ demoId: demo.id as string, companyId, userId: account.userId, fullName, email, status: "active" });

  const { data: seeded, error: seedErr } = await supabase.rpc("seed_demo_company", {
    p_company: companyId,
    p_conductor: login.ok ? account.userId : null,
  });
  await rebakeFormFieldOptions(companyId);
  const policyProblems = seedErr ? [] : await finishDemoPolicies(companyId, user.id);
  // Now the sample data is in, the login waits for its password on the Welcome page.
  if (login.ok) await markDemoLoginWaiting(account.userId);

  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.created",
    entityType: "demo",
    entityId: demo.id as string,
    summary: `Set up a ${days.days} day demo for ${clientName}`,
    metadata: { company_id: companyId, days: days.days, login_email: email, seeded: seeded ?? null, seed_error: seedErr?.message ?? null, policy_problems: policyProblems, login_ok: login.ok, login_error: login.ok ? null : login.error },
  });

  // The login email, always: it carries the only way in (the set password link). Sent after
  // everything is built so the client never lands in an empty company.
  let mailFlag = "";
  if (login.ok && !seedErr) {
    const mailed = await sendDemoLoginEmail({ demoId: demo.id as string, fullName, email });
    await writeAudit({
      companyId: null,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: "platform_admin",
      action: "demo.login_emailed",
      entityType: "demo",
      entityId: demo.id as string,
      summary: mailed.ok ? `Emailed the demo login details to ${email}` : `The demo login email to ${email} was not sent`,
      metadata: { email, sent: mailed.ok, error: mailed.ok ? null : mailed.error },
    });
    mailFlag = mailed.ok ? "&emailed=1" : `&emailed=0&mailwhy=${encodeURIComponent(mailed.error)}`;
  }

  const flag = !login.ok ? `?problem=login&why=${encodeURIComponent(login.error)}` : seedErr ? "?problem=seed" : `?created=1${mailFlag}`;
  redirect(`/founder/demos/${demo.id as string}${flag}`);
}

export async function addDemoLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const fullName = field(formData, "full_name");
  const email = field(formData, "email").toLowerCase();
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, company_id, client_name, deleted_at").eq("id", demoId).maybeSingle();
  if (!demo || !demo.company_id || demo.deleted_at) return { error: "That demo has been deleted, so no login can be added." };
  const problem = await demoLoginProblem({ fullName, email });
  if (problem) return { error: problem };
  const login = await createDemoLogin({ demoId, companyId: demo.company_id as string, fullName, email });
  if (!login.ok) return { error: login.error };
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.login_added",
    entityType: "demo",
    entityId: demoId,
    summary: `Added a demo login for ${email} (${demo.client_name as string})`,
    metadata: { email },
  });
  revalidatePath(`/founder/demos/${demoId}`);
  {
    const mailed = await sendDemoLoginEmail({ demoId, fullName, email });
    await writeAudit({
      companyId: null,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: "platform_admin",
      action: "demo.login_emailed",
      entityType: "demo",
      entityId: demoId,
      summary: mailed.ok ? `Emailed the demo login details to ${email}` : `The demo login email to ${email} was not sent`,
      metadata: { email, sent: mailed.ok, error: mailed.ok ? null : mailed.error },
    });
    if (!mailed.ok) return { error: `Login made for ${email}, but the email was not sent: ${mailed.error} Use Send a new link on their login.` };
    return { ok: `Login made for ${email} and emailed a link to choose their password.` };
  }
}

/**
 * SEND A NEW LINK for a login that already exists (Phil, 2026-10-02). No password is typed or
 * stored: the email carries a fresh one time link. Not used yet, it lets them choose their password;
 * already in use, it lets them choose a new one.
 */
export async function emailDemoLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const loginId = field(formData, "login_id");
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, ends_at, deleted_at").eq("id", demoId).maybeSingle();
  if (!demo || demo.deleted_at) return { error: "That demo has been deleted." };
  const phase = demoPhase(demo.ends_at as string);
  if (phase === "ended" || phase === "purge_due") return { error: "This demo has ended, so its logins do not work. Extend it first." };
  const { data: login } = await supabase
    .from("demo_logins")
    .select("id, user_id, email, full_name")
    .eq("id", loginId)
    .eq("demo_id", demoId)
    .maybeSingle();
  if (!login || !login.user_id) return { error: "That login was not found on this demo." };
  const mailed = await sendDemoLoginEmail({
    demoId,
    fullName: login.full_name as string,
    email: login.email as string,
  });
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.login_emailed",
    entityType: "demo",
    entityId: demoId,
    summary: mailed.ok ? `Emailed a new sign in link to ${login.email as string}` : `The demo login email to ${login.email as string} was not sent`,
    metadata: { email: login.email, sent: mailed.ok, error: mailed.ok ? null : mailed.error },
  });
  if (!mailed.ok) return { error: `The email was not sent: ${mailed.error}` };
  return { ok: `Emailed a new link to ${login.email as string}.` };
}

/** Add days to the end date (counted from now if it has already ended). */
export async function extendDemo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const days = parseDemoDays(field(formData, "days"));
  if (!days.ok) return { error: days.error };
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, ends_at, client_name, deleted_at").eq("id", demoId).maybeSingle();
  if (!demo || demo.deleted_at) return { error: "That demo has been deleted, so it cannot be extended." };
  const from = Math.max(Date.now(), new Date(demo.ends_at as string).getTime());
  const endsAt = demoEndsAt(days.days, new Date(from));
  const { error } = await supabase.from("demos").update({ ends_at: endsAt.toISOString(), feedback_emailed_at: null }).eq("id", demoId);
  if (error) return { error: error.message };
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.extended",
    entityType: "demo",
    entityId: demoId,
    summary: `Extended the demo for ${demo.client_name as string} by ${days.days} days`,
    metadata: { days: days.days, ends_at: endsAt.toISOString() },
  });
  revalidatePath(`/founder/demos/${demoId}`);
  return { ok: `Extended by ${days.days} ${days.days === 1 ? "day" : "days"}.` };
}

/** Stop the logins now. The company is still deleted 14 days from now. */
export async function endDemoNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, client_name, deleted_at, starts_at").eq("id", demoId).maybeSingle();
  if (!demo || demo.deleted_at) return { error: "That demo has already been deleted." };
  const now = new Date();
  const start = new Date(demo.starts_at as string);
  // ends_at must stay after starts_at (a check constraint), so a demo ended in its first second ends a second later.
  const endsAt = now.getTime() > start.getTime() ? now : new Date(start.getTime() + 1000);
  const { error } = await supabase.from("demos").update({ ends_at: endsAt.toISOString() }).eq("id", demoId);
  if (error) return { error: error.message };
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.ended",
    entityType: "demo",
    entityId: demoId,
    summary: `Ended the demo for ${demo.client_name as string} early`,
    metadata: {},
  });
  revalidatePath(`/founder/demos/${demoId}`);
  return { ok: "Ended. Their logins stop now, and the survey email goes with tomorrow morning's run." };
}

/** Delete the demo company now, rather than waiting for the 14 days. */
export async function deleteDemoNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  if (field(formData, "confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const out = await purgeDemo(demoId, "founder");
  if (!out.ok) return { error: out.error };
  revalidatePath(`/founder/demos/${demoId}`);
  return { ok: "Deleted. The demo company and its logins are gone; its usage figures and feedback are kept here." };
}

/**
 * ARCHIVE (0372, Phil 2026-10-02: "add a archive button"). Takes a deleted demo off the Demos list
 * without erasing its usage or feedback; Unarchive puts it back. A demo whose company still exists
 * cannot be archived, so a running demo is never hidden by mistake. Safe to press twice.
 */
export async function setDemoArchived(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const archive = field(formData, "archive") !== "0";
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, client_name, deleted_at, archived_at").eq("id", demoId).maybeSingle();
  if (!demo) return { error: "That demo no longer exists." };
  if (archive && !demo.deleted_at) return { error: "Delete the demo company first. Only a deleted demo can be archived." };
  if (archive === Boolean(demo.archived_at)) {
    revalidatePath("/founder/demos");
    return { ok: archive ? "Already archived." : "Already on the list." };
  }
  const { error } = await supabase
    .from("demos")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", demoId);
  if (error) return { error: error.message };
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: archive ? "demo.archived" : "demo.unarchived",
    entityType: "demo",
    entityId: demoId,
    summary: `${archive ? "Archived" : "Unarchived"} the demo for ${demo.client_name as string}`,
    metadata: {},
  });
  revalidatePath("/founder/demos");
  revalidatePath(`/founder/demos/${demoId}`);
  return { ok: archive ? "Archived." : "Back on the list." };
}

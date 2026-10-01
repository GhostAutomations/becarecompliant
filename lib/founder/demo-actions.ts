"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { rebakeFormFieldOptions } from "@/lib/forms/rebake-options";
import type { ActionState } from "@/lib/forms";
import { DEMO_COMPANY_NAME, demoEndsAt, parseDemoDays } from "@/lib/demo/rules";
import { attachDemoLogin, createDemoLogin, createDemoUser, demoLoginProblem, discardDemoUser, purgeDemo } from "@/lib/demo/manage";

/**
 * FOUNDER > DEMOS (0356, Phil 2026-09-30). A fresh Demo Care Company Limited per client, filled
 * with made up data, with a login whose password the founder sets, running for the days he sets
 * (7 by default). Only the founder can make, extend, end or delete one.
 */

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createDemo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const clientName = field(formData, "client_name");
  const fullName = field(formData, "full_name");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const days = parseDemoDays(field(formData, "days"));

  if (!clientName) return { error: "Enter who the demo is for (their company or name)." };
  if (clientName.length > 120) return { error: "Keep the client name to 120 characters." };
  if (!days.ok) return { error: days.error };
  const problem = await demoLoginProblem({ fullName, email, password });
  if (problem) return { error: problem };

  // The sign-in account first: if the password is refused, nothing else has been built and the
  // founder's form keeps everything they typed.
  const account = await createDemoUser({ fullName, email, password });
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

  const { data: seeded, error: seedErr } = await supabase.rpc("seed_demo_company", { p_company: companyId });
  await rebakeFormFieldOptions(companyId);

  const login = await attachDemoLogin({ demoId: demo.id as string, companyId, userId: account.userId, fullName, email });

  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "demo.created",
    entityType: "demo",
    entityId: demo.id as string,
    summary: `Set up a ${days.days} day demo for ${clientName}`,
    metadata: { company_id: companyId, days: days.days, login_email: email, seeded: seeded ?? null, seed_error: seedErr?.message ?? null, login_ok: login.ok, login_error: login.ok ? null : login.error },
  });

  const flag = !login.ok ? `?problem=login&why=${encodeURIComponent(login.error)}` : seedErr ? "?problem=seed" : "?created=1";
  redirect(`/founder/demos/${demo.id as string}${flag}`);
}

export async function addDemoLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const demoId = field(formData, "demo_id");
  const fullName = field(formData, "full_name");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data: demo } = await supabase.from("demos").select("id, company_id, client_name, deleted_at").eq("id", demoId).maybeSingle();
  if (!demo || !demo.company_id || demo.deleted_at) return { error: "That demo has been deleted, so no login can be added." };
  const problem = await demoLoginProblem({ fullName, email, password });
  if (problem) return { error: problem };
  const login = await createDemoLogin({ demoId, companyId: demo.company_id as string, fullName, email, password });
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
  return { ok: `Login made for ${email}. Give them the password you chose.` };
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

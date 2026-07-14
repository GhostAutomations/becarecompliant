"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAndSendInvite, resendInvite, revokeInvite, type Actor } from "@/lib/invites";
import { syncSeatQuantity } from "@/lib/billing/stripe-sync";
import {
  MANAGE_AS_COOKIE,
  MANAGE_AS_TTL_SECONDS,
  signManageAs,
  readActingCompanyId,
} from "@/lib/founder/manage-as";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

/** The founder acting as themselves, for audit attribution on tenant writes. */
async function founderActor(): Promise<{ actor: Actor }> {
  const { user, profile } = await requirePlatformAdmin();
  return {
    actor: {
      id: user.id,
      name: profile.full_name || profile.email,
      email: profile.email,
      role: "platform_admin",
    },
  };
}

const VALID_TIERS = ["business", "pro", "enterprise", "diamond", "black"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Founder-led company creation. Seeds one Team (office) + one Branch and,
 *  optionally, invites the first Company Admin. */
export async function createCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const tier = String(formData.get("tier") ?? "business");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const branchName =
    String(formData.get("branch_name") ?? "").trim() || "Main Branch";
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim();

  if (!name) return { error: "Enter a company name." };
  if (!VALID_TIERS.includes(tier)) return { error: "Choose a valid tier." };

  const slug = slugInput ? slugify(slugInput) : slugify(name);
  if (!slug) return { error: "Could not derive a slug. Enter one manually." };

  const supabase = await createClient();

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({ name, slug, tier })
    .select("id, name")
    .single();
  if (companyErr) {
    if (companyErr.code === "23505") {
      return { error: "That slug is already taken. Choose another." };
    }
    return { error: companyErr.message };
  }

  // Seed the included Team (office) and first Branch.
  const { error: branchErr } = await supabase.from("branches").insert([
    { company_id: company.id, name: `${name} Office`, kind: "team" },
    { company_id: company.id, name: branchName, kind: "branch" },
  ]);
  if (branchErr) {
    return { error: `Company created, but seeding branches failed: ${branchErr.message}` };
  }

  // Seed the founder-curated starter forms so the company has usable forms on
  // day one. Idempotent (safe if re-run); runs as the platform admin, which the
  // SECURITY DEFINER function authorises. A seeding failure must not fail company
  // creation, so it is surfaced in the note rather than thrown.
  const { data: seededCount, error: seedErr } = await supabase.rpc(
    "seed_company_form_templates",
    { cid: company.id },
  );

  // Seed the default People check catalogue (idempotent), linking each check to
  // the Forms just seeded. A failure must not fail company creation.
  const { data: checksSeeded, error: checksErr } = await supabase.rpc(
    "seed_company_people_checks",
    { cid: company.id },
  );

  // Seed the default Service User check catalogue (idempotent), linking each check to
  // the Forms just seeded. A failure must not fail company creation.
  const { data: suChecksSeeded, error: suChecksErr } = await supabase.rpc(
    "seed_company_service_user_checks",
    { cid: company.id },
  );

  // Seed the founder-curated training course catalogue (idempotent). A failure
  // must not fail company creation.
  const { data: trainingSeeded, error: trainingErr } = await supabase.rpc(
    "seed_company_training_courses",
    { cid: company.id },
  );

  await writeAudit({
    companyId: company.id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.created",
    entityType: "company",
    entityId: company.id,
    summary: `Created company ${name} on the ${tier} tier`,
    metadata: {
      tier,
      slug,
      branch_name: branchName,
      forms_seeded: seededCount ?? 0,
      checks_seeded: checksErr ? 0 : (checksSeeded ?? 0),
      su_checks_seeded: suChecksErr ? 0 : (suChecksSeeded ?? 0),
      training_seeded: trainingErr ? 0 : (trainingSeeded ?? 0),
    },
  });

  let note = `Company ${name} created with its Team and first Branch.`;
  if (seedErr) {
    note += ` The starter forms could not be seeded: ${seedErr.message}`;
  } else {
    note += ` ${seededCount ?? 0} starter forms were added.`;
  }
  if (checksErr) {
    note += ` The People checks could not be seeded: ${checksErr.message}`;
  } else {
    note += ` ${checksSeeded ?? 0} People checks were configured.`;
  }
  if (suChecksErr) {
    note += ` The Service User checks could not be seeded: ${suChecksErr.message}`;
  } else {
    note += ` ${suChecksSeeded ?? 0} Service User checks were configured.`;
  }
  if (trainingErr) {
    note += ` The training courses could not be seeded: ${trainingErr.message}`;
  } else {
    note += ` ${trainingSeeded ?? 0} training courses were added.`;
  }

  if (adminEmail) {
    const outcome = await createAndSendInvite({
      companyId: company.id,
      companyName: company.name,
      branchId: null,
      email: adminEmail,
      fullName: adminName,
      role: "company_admin",
      inviter: {
        id: user.id,
        name: profile.full_name || profile.email,
        email: profile.email,
        role: "platform_admin",
      },
    });
    if (!outcome.ok) {
      note += ` The Admin invite could not be sent: ${outcome.error}`;
    } else if (!outcome.emailSent) {
      note += ` The Admin invite was recorded, but the email was not sent (${outcome.emailNote ?? "email not configured"}).`;
    } else {
      note += ` An Admin invite was emailed to ${adminEmail}.`;
    }
  }

  revalidatePath("/founder");
  return { ok: note };
}

/** Suspend, archive or reactivate a company. */
export async function setCompanyStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!companyId || !["active", "suspended", "archived"].includes(status)) {
    return { error: "Choose a valid status." };
  }

  const supabase = await createClient();
  // Read the previous status so the audit trail records old and new, and so a
  // no-op (nothing updated) surfaces as a visible error rather than a silent pass.
  const { data: before } = await supabase
    .from("companies")
    .select("status")
    .eq("id", companyId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("companies")
    .update({ status })
    .eq("id", companyId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "No change was saved. The company may not exist or you may not have permission." };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    summary: `Set company status from ${before?.status ?? "unknown"} to ${status}`,
    metadata: { status, previous_status: before?.status ?? null },
  });

  revalidatePath("/founder");
  return { ok: `Status set to ${status}.` };
}

/** Founder: enable or disable a user in any company (drill-in page). Company
 *  Admins and other platform admins are managed separately, not here. */
export async function founderSetUserStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor } = await founderActor();
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["active", "disabled"].includes(status)) {
    return { error: "Choose a valid status." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target || !target.company_id) return { error: "User not found." };
  if (target.role === "company_admin" || target.role === "platform_admin") {
    return { error: "Admins are managed separately." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "No change was saved. The user may not exist." };
  }

  await writeAudit({
    companyId: target.company_id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "user.status_changed",
    entityType: "profile",
    entityId: userId,
    summary: `Founder set user status to ${status}`,
    metadata: { status },
  });
  // Active seat count changed: sync to Stripe (no-op if unbilled/Diamond/Black).
  await syncSeatQuantity(target.company_id);
  revalidatePath(`/founder/companies/${target.company_id}`);
  return { ok: status === "disabled" ? "User disabled." : "User enabled." };
}

/** Founder: resend a pending invite in any company (drill-in page). */
export async function founderResendInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor } = await founderActor();
  const inviteId = String(formData.get("invite_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!inviteId) return { error: "Missing invite." };
  const outcome = await resendInvite(inviteId, actor);
  if (companyId) revalidatePath(`/founder/companies/${companyId}`);
  if (!outcome.ok) return { error: outcome.error };
  if (!outcome.emailSent) {
    return {
      ok: `Invite updated, but the email was not sent (${outcome.emailNote ?? "email not configured"}).`,
    };
  }
  return { ok: "Invite resent." };
}

/** Founder: revoke a pending invite in any company (drill-in page). */
export async function founderRevokeInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor } = await founderActor();
  const inviteId = String(formData.get("invite_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!inviteId) return { error: "Missing invite." };
  const outcome = await revokeInvite(inviteId, actor);
  if (companyId) revalidatePath(`/founder/companies/${companyId}`);
  if (!outcome.ok) return { error: outcome.error };
  return { ok: "Invite revoked." };
}

// ---------------------------------------------------------------------------
// Training course template curation (founder master data, seeds new companies).
// RLS (tct_write) already restricts these tables to the platform admin; we
// re-guard with requirePlatformAdmin for defence in depth.
// ---------------------------------------------------------------------------

const TRAINING_TEMPLATES_PATH = "/founder/training-templates";

function parseTemplateFields(formData: FormData): {
  name: string;
  renewal_months: number | null;
  mandatory: boolean;
  is_safeguarding: boolean;
  amber_days: number;
  sort_order: number;
} {
  const name = String(formData.get("name") ?? "").trim();
  const renewalRaw = String(formData.get("renewal_months") ?? "").trim();
  const renewal_months = renewalRaw === "" ? null : Math.max(1, Number(renewalRaw) || 1);
  const amberRaw = String(formData.get("amber_days") ?? "").trim();
  const amber_days = amberRaw === "" ? 30 : Math.max(0, Number(amberRaw) || 0);
  const sortRaw = String(formData.get("sort_order") ?? "").trim();
  const sort_order = sortRaw === "" ? 0 : Number(sortRaw) || 0;
  return {
    name,
    renewal_months,
    mandatory: formData.get("mandatory") === "on",
    is_safeguarding: formData.get("is_safeguarding") === "on",
    amber_days,
    sort_order,
  };
}

/** Founder: create a training course template. */
export async function createTrainingTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const fields = parseTemplateFields(formData);
  if (!fields.name) return { error: "Enter a course name." };

  const supabase = await createClient();
  const { error } = await supabase.from("training_course_templates").insert(fields);
  if (error) return { error: error.message };

  revalidatePath(TRAINING_TEMPLATES_PATH);
  return { ok: `Added ${fields.name}.` };
}

/** Founder: update a training course template. */
export async function updateTrainingTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing template." };
  const fields = parseTemplateFields(formData);
  if (!fields.name) return { error: "Enter a course name." };
  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_course_templates")
    .update({ ...fields, active })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved." };

  revalidatePath(TRAINING_TEMPLATES_PATH);
  return { ok: "Saved." };
}

// ---------------------------------------------------------------------------
// Manage as company (support mode). Founder operates inside one tenant as its
// Admin via a signed, 30 minute httpOnly cookie. No second login (single-session
// untouched); the founder already has cross-company DB access. Entry and exit
// are audited; the guards shadow the profile to the acting company.
// ---------------------------------------------------------------------------

/** Founder: start managing as a company. Sets the cookie and lands on that
 *  company's dashboard. */
export async function enterManageAs(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { actor } = await founderActor();
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { error: "Missing company." };

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return { error: "Company not found." };

  const token = signManageAs(companyId);
  if (!token) {
    return { error: "Manage as is unavailable: the server secret is not configured." };
  }

  const store = await cookies();
  store.set(MANAGE_AS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MANAGE_AS_TTL_SECONDS,
  });

  await writeAudit({
    companyId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: "platform_admin",
    action: "founder.manage_as.enter",
    entityType: "company",
    entityId: companyId,
    summary: `Founder started managing as ${company.name}`,
    metadata: { company_name: company.name },
  });

  redirect("/dashboard");
}

/** Founder: stop managing as a company. Clears the cookie and returns to the
 *  Founder console. Safe to call when not impersonating. */
export async function exitManageAs(): Promise<void> {
  const { actor } = await founderActor();
  const acting = await readActingCompanyId();

  const store = await cookies();
  store.delete(MANAGE_AS_COOKIE);

  if (acting) {
    await writeAudit({
      companyId: acting,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: "platform_admin",
      action: "founder.manage_as.exit",
      entityType: "company",
      entityId: acting,
      summary: "Founder stopped managing as company",
      metadata: {},
    });
  }

  redirect("/founder");
}

/** Founder: delete a training course template (does not affect companies already seeded). */
export async function deleteTrainingTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing template." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("training_course_templates")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(TRAINING_TEMPLATES_PATH);
  return { ok: "Template deleted." };
}

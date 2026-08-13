"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { syncBranchQuantity } from "@/lib/billing/stripe-sync";
import { removalRefusal, type RemovalResult } from "@/lib/branches/removal";
import { changeTier } from "@/lib/billing/tier-apply";
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
import { importCompanyTemplates, importSummary } from "@/lib/templates/import";
import { rebakeFormFieldOptions } from "@/lib/forms/rebake-options";
import { REGISTER_COLUMNS } from "@/lib/people/logic";
import { SU_REGISTER_COLUMNS } from "@/lib/service-users/types";
import type { ActionState } from "@/lib/forms";
import {
  isTrialRequestStatus,
  trialRequestStatusLabel,
} from "@/lib/founder/trial-requests";
import { trialDomainFor } from "@/lib/founder/trial-matching";

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

const VALID_TIERS = ["business", "pro", "black"];

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

  // Seed the default staff job-title list (idempotent). A failure must not fail
  // company creation.
  await supabase.rpc("seed_company_job_titles", { cid: company.id });

  // The seeded Forms carry the generic template options, so bake this company's own
  // Office and first Branch into every branch field straight away (best-effort, see
  // rebake-options.ts).
  await rebakeFormFieldOptions(company.id);

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

/** Founder: import the founder-curated master templates (forms + training
 *  courses) into an existing company, topping up anything it is missing.
 *  Idempotent; the SECURITY DEFINER seed RPCs authorise the platform admin. */
export async function founderImportTemplates(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { error: "Missing company." };

  const result = await importCompanyTemplates(companyId);

  // Imported copies arrive with the master template's generic options, so bake this
  // company's branches and staff into them (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(companyId);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.templates_imported",
    entityType: "company",
    entityId: companyId,
    summary: `Imported master templates: ${result.formsAdded} forms, ${result.trainingAdded} training courses`,
    metadata: {
      forms_added: result.formsAdded,
      training_added: result.trainingAdded,
      forms_error: result.formsError,
      training_error: result.trainingError,
    },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  if (result.formsError && result.trainingError) {
    return { error: importSummary(result) };
  }
  return { ok: importSummary(result) };
}

/** Founder: set a company's People supervision cycle mode (Annual Appraisal cycle,
 *  or four supervisions with no appraisal). */
export async function setSupervisionCycleMode(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  if (!companyId) return { error: "Missing company." };
  if (mode !== "appraisal" && mode !== "four_supervisions") return { error: "Invalid cycle mode." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ supervision_cycle_mode: mode })
    .eq("id", companyId);
  if (error) return { error: error.message };

  // The Annual Appraisal check only exists in appraisal mode. Deactivating it in
  // four-supervisions mode cleanly removes it from the matrix, register, scheduling
  // and reports (they all filter active checks), and restores it on switch back.
  await supabase
    .from("check_definitions")
    .update({ active: mode === "appraisal" })
    .eq("company_id", companyId)
    .eq("population", "people")
    .eq("key", "appraisal");

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.supervision_cycle_mode_set",
    entityType: "company",
    entityId: companyId,
    summary: `Set supervision cycle mode to ${mode === "appraisal" ? "Supervision 1-3 + Annual Appraisal" : "4 Supervisions"}`,
    metadata: { mode },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/people");
  return { ok: "Saved" };
}

/** Founder: rename the People register column terminology for one company. A
 *  company may call a column something different; blank reverts to the default. */
export async function setPeopleColumnLabels(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  if (!companyId) return { error: "Missing company." };

  const labels: Record<string, string> = {};
  for (const col of REGISTER_COLUMNS) {
    const v = String(formData.get(`col_${col.key}`) ?? "").trim();
    // Store the company's wording only; matching the default (or blank) reverts.
    if (v && v !== col.name) labels[col.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ people_column_labels: labels })
    .eq("id", companyId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.column_labels_updated",
    entityType: "company",
    entityId: companyId,
    summary: "Founder updated People register column terminology",
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/people");
  return { ok: "Saved" };
}

/** Founder: rename the Service User register column terminology for one company. */
export async function setServiceUserColumnLabels(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  if (!companyId) return { error: "Missing company." };

  const labels: Record<string, string> = {};
  for (const col of SU_REGISTER_COLUMNS) {
    const v = String(formData.get(`col_${col.key}`) ?? "").trim();
    // Store the company's wording only; matching the default (or blank) reverts.
    if (v && v !== col.name) labels[col.key] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ service_user_column_labels: labels })
    .eq("id", companyId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.su_column_labels_updated",
    entityType: "company",
    entityId: companyId,
    summary: "Founder updated Service User register column terminology",
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/service-users");
  return { ok: "Saved" };
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
  // Enabling/disabling changes who the company's Form staff dropdowns should offer
  // (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(target.company_id);
  // Active seat count changed: sync to Stripe (no-op if unbilled or Black).
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


/**
 * Founder: move a trial request along, and keep a running note against it.
 *
 * A trial request is a LEAD, not a tenant. Nothing here provisions anything: setting
 * the status to "provisioned" only records that the founder has already created the
 * company by hand on /founder/new. That is deliberate (see migration 0151).
 *
 * Platform admin only twice over. requirePlatformAdmin guards the action, and the
 * trial_requests RLS policy from 0086 admits nobody else for any command, so a
 * non-admin's update matches no policy and changes zero rows. The returned row count
 * is checked below precisely so that refusal surfaces as a visible error in the form
 * rather than a false "Saved".
 */
export async function setTrialRequestStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  // Founder-typed, but bounded anyway so one paste cannot fill the column.
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000);

  if (!requestId) return { error: "Missing trial request." };
  if (!isTrialRequestStatus(status)) return { error: "Choose a valid status." };

  const supabase = await createClient();

  // Read what is there now so the audit entry records old and new, and so the note is
  // only reported as changed when it actually changed.
  const { data: before } = await supabase
    .from("trial_requests")
    .select("status, notes, company_name")
    .eq("id", requestId)
    .maybeSingle();

  const previousStatus = (before?.status as string | null) ?? null;
  const previousNotes = ((before?.notes as string | null) ?? "").trim();
  const statusChanged = previousStatus !== status;
  const notesChanged = previousNotes !== notes;

  const patch: Record<string, unknown> = { notes: notes || null, status };
  // Only stamp who and when when the status genuinely moved: editing a note must not
  // rewrite the record of when the lead was last worked.
  if (statusChanged) {
    patch.status_changed_at = new Date().toISOString();
    patch.status_changed_by = user.id;
  }

  const { data, error } = await supabase
    .from("trial_requests")
    .update(patch)
    .eq("id", requestId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "No change was saved. The request may not exist or you may not have permission.",
    };
  }

  if (statusChanged || notesChanged) {
    // companyId is null ON PURPOSE. A trial request has no tenant yet: that is the
    // whole point of the screen. audit_log.company_id is nullable and the founder
    // audit console already reads platform-level rows (audit_log_select passes any
    // row for a platform admin), so a null keeps this out of every company's own
    // audit trail, which is exactly where it does not belong.
    await writeAudit({
      companyId: null,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: "platform_admin",
      action: statusChanged ? "trial_request.status_changed" : "trial_request.note_updated",
      entityType: "trial_request",
      entityId: requestId,
      summary: statusChanged
        ? `Set trial request from ${before?.company_name ?? "an unknown company"} to ${trialRequestStatusLabel(status)}`
        : `Updated the note on the trial request from ${before?.company_name ?? "an unknown company"}`,
      metadata: {
        status,
        previous_status: previousStatus,
        note_changed: notesChanged,
      },
    });
  }

  revalidatePath("/founder/trial-requests");
  revalidatePath("/founder");
  return { ok: "Saved" };
}


/**
 * Founder: provision a whole tenant from a trial request, in ONE press.
 *
 * This is how a trial starts. The applicant never creates anything: they ask, the request
 * lands on this screen carrying flags for anything already seen, and the founder decides.
 * That is why there is no public route anywhere in this feature and no service role
 * client: the caller is the signed in platform admin, so the five seed functions are
 * satisfied by their existing guard and did not have to be loosened.
 *
 * ATOMIC. Everything goes through provision_company() (migration 0152), which creates the
 * company, both branches and all five seed catalogues inside ONE transaction. If a seed
 * throws, the company never existed and the founder simply presses again. createCompany,
 * which does the same work statement by statement, can leave a half seeded company behind
 * for ever and only mentions it in a note.
 *
 * THE DUPLICATE RULES ARE ENFORCED IN THE FUNCTION, NOT HERE. The panel on the screen is
 * for the founder to READ. The rule that actually holds lives in provision_company, so two
 * tabs, a double press or any future caller cannot slip past a rendered page. An override
 * is only possible when a reason has been typed, and that reason is written to the audit
 * log below.
 *
 * The 14 day clock starts at THIS press, not when the request arrived, so somebody who
 * asked on Friday night does not lose two days of their trial waiting for a reply.
 */
export async function provisionFromTrialRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();

  const requestId = String(formData.get("request_id") ?? "").trim();
  const tier = String(formData.get("tier") ?? "business").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const branchName = String(formData.get("branch_name") ?? "").trim() || "Main Branch";
  const daysRaw = Number(String(formData.get("trial_days") ?? "14").trim());
  const overrideReason = String(formData.get("override_reason") ?? "").trim().slice(0, 500);

  if (!requestId) return { error: "Missing trial request." };
  if (!VALID_TIERS.includes(tier)) return { error: "Choose a valid tier." };
  const trialDays = Number.isFinite(daysRaw)
    ? Math.min(90, Math.max(0, Math.trunc(daysRaw)))
    : 14;

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("trial_requests")
    .select("id, company_name, contact_name, email, company_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "That trial request no longer exists." };
  if (request.company_id) {
    return {
      error:
        "That request has already been provisioned. Open the company from the request rather than creating a second one.",
    };
  }

  const name = String(request.company_name ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(name);
  if (!slug) {
    return { error: "Could not derive a slug from that company name. Enter one manually." };
  }

  const ownerEmail = String(request.email ?? "").trim().toLowerCase();
  // Null for a personal provider, which is exactly how gmail and the rest escape the one
  // per domain rule: a partial unique index cannot constrain a NULL.
  const ownerDomain = trialDomainFor(ownerEmail);

  const { data: result, error } = await supabase.rpc("provision_company", {
    p_name: name,
    p_slug: slug,
    p_tier: tier,
    p_branch_name: branchName,
    p_trial_days: trialDays,
    p_owner_email: ownerEmail,
    p_owner_domain: ownerDomain,
    p_request_id: requestId,
    p_override_reason: overrideReason || null,
  });
  // provision_company raises plain English for every refusal it makes, so the founder
  // reads why rather than a constraint name.
  if (error) return { error: error.message };

  const outcome = (result ?? {}) as {
    company_id?: string;
    forms_seeded?: number;
    people_checks_seeded?: number;
    su_checks_seeded?: number;
    training_seeded?: number;
  };
  const companyId = outcome.company_id;
  if (!companyId) {
    return { error: "The company was not created, so nothing has changed. Try again." };
  }

  // The seeded Forms carry the generic template options, so bake this company's own Office
  // and first Branch into every branch field straight away (best effort, see
  // rebake-options.ts). Outside the transaction on purpose: it must never undo a company.
  await rebakeFormFieldOptions(companyId);

  const invite = await createAndSendInvite({
    companyId,
    companyName: name,
    branchId: null,
    email: ownerEmail,
    fullName: String(request.contact_name ?? "").trim(),
    role: "company_admin",
    inviter: {
      id: user.id,
      name: profile.full_name || profile.email,
      email: profile.email,
      role: "platform_admin",
    },
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "company.created",
    entityType: "company",
    entityId: companyId,
    summary: `Provisioned ${name} on the ${tier} tier from a trial request, with a ${trialDays} day trial`,
    metadata: {
      tier,
      slug,
      branch_name: branchName,
      trial_days: trialDays,
      from_trial_request: requestId,
      forms_seeded: outcome.forms_seeded ?? 0,
      checks_seeded: outcome.people_checks_seeded ?? 0,
      su_checks_seeded: outcome.su_checks_seeded ?? 0,
      training_seeded: outcome.training_seeded ?? 0,
      admin_invited: invite.ok,
      override_reason: overrideReason || null,
    },
  });

  // companyId null ON PURPOSE, exactly as setTrialRequestStatus does: the lead itself is
  // platform level and does not belong in the new company's own audit trail.
  await writeAudit({
    companyId: null,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: "trial_request.provisioned",
    entityType: "trial_request",
    entityId: requestId,
    summary: overrideReason
      ? `Provisioned ${name} from a trial request, overriding a duplicate warning: ${overrideReason}`
      : `Provisioned ${name} from a trial request`,
    metadata: {
      company_id: companyId,
      tier,
      trial_days: trialDays,
      override_reason: overrideReason || null,
    },
  });

  revalidatePath("/founder/trial-requests");
  revalidatePath("/founder/companies");
  revalidatePath("/founder");

  // The company exists either way, so an invite failure is reported rather than hidden:
  // the founder has to go and invite them from the company screen.
  if (!invite.ok) {
    return {
      error: `${name} was created and the trial has started, but the Admin invite could not be sent: ${invite.error} Invite them from the company screen.`,
    };
  }
  if (!invite.emailSent) {
    return {
      error: `${name} was created and the trial has started, and the Admin invite was recorded, but the email was not sent (${invite.emailNote ?? "email not configured"}).`,
    };
  }

  return { redirectTo: `/founder/companies/${companyId}` };
}

/**
 * Add an operational branch to a company (THE LIST item 16).
 *
 * WHY THIS EXISTS AT ALL. Until now nothing in the product created a branch. The only insert
 * anywhere was the Office and first Branch seeded with a new company, and every extra branch
 * on the test company was added by hand in SQL. So "branches are founder provisioned" meant
 * "founder writes SQL", and the £7.50 a month the pricing page promises for an extra branch
 * could never have been billed by any code path, because there was no path.
 *
 * Creating one here bills it immediately (syncBranchQuantity, prorated onto the next invoice
 * exactly like an extra user). The nightly reconcile in the invoicing cron is the belt to this
 * pair of braces: it catches a branch added any other way, including straight in SQL.
 *
 * Platform admin only, like every other founder action.
 */
/**
 * Remove an operational branch — the undo for one added by mistake.
 *
 * WHY THE REAL WORK IS IN THE DATABASE (migration 0181). The foreign keys onto branches
 * CASCADE from reg73_visits and reg80_reviews, so a plain delete would erase the statutory
 * Regulation 73 visits and Regulation 80 quality reviews held against that branch, and SET
 * NULL would quietly detach incidents, evidence and checks from it. remove_unused_branch
 * refuses unless nothing at all references the branch, and does the check and the delete
 * under one lock so nothing can be inserted between them.
 *
 * A client-side control is not a guard, and neither is this action: both are manners on top
 * of the rule.
 */
export async function removeBranch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim();
  if (!companyId || !branchId) return { error: "Missing branch." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_unused_branch", { p_branch: branchId });
  if (error) return { error: error.message };

  const result = (data ?? null) as RemovalResult | null;
  const refusal = removalRefusal(result);
  if (refusal) return { error: refusal };

  const name = (result?.name ?? "").trim() || "The branch";

  // Stop billing for it. Best effort by the same contract as addBranch: the branch is gone
  // either way, and the nightly reconcile corrects the quantity if Stripe was unreachable.
  const billed = await syncBranchQuantity(companyId);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "branch.removed",
    entityType: "branch",
    entityId: branchId,
    summary: `Removed the branch ${name}`,
    metadata: {
      billed: billed.synced,
      billing_reason: billed.reason ?? null,
      quantity: billed.quantity ?? null,
    },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/settings/branches");
  return {
    ok:
      billed.synced && billed.quantity !== undefined
        ? `Removed ${name}. Billing updated to ${billed.quantity} extra branch${billed.quantity === 1 ? "" : "es"}.`
        : `Removed ${name}.`,
  };
}

/**
 * Move a company to another plan, and settle Stripe.
 *
 * Until 2026-08-13 nothing in the product could do this: companies.tier was written at creation
 * and by trial provisioning and by nothing else. So Thistle could not be put on Black without
 * hand-written SQL, and no Business customer could ever upgrade to Pro.
 *
 * The rule and the Stripe work live in lib/billing/tier-apply.ts, shared with the customer's own
 * upgrade on /settings/billing, so the two cannot disagree about what is allowed.
 */
export async function changeCompanyTier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  const tier = String(formData.get("tier") ?? "").trim();
  if (!companyId) return { error: "Missing company." };
  if (!tier) return { error: "Choose a plan." };

  const outcome = await changeTier({ companyId, to: tier, actor: "founder" });
  if (!outcome.ok) return { error: outcome.error };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "billing.tier_changed",
    entityType: "company",
    entityId: companyId,
    summary: `Moved from the ${outcome.from} plan to the ${outcome.to} plan`,
    metadata: { from: outcome.from, to: outcome.to, billing_settled: outcome.billingSettled },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/founder");
  revalidatePath("/settings/billing");
  // A Stripe half that did not settle is reported as an ERROR even though the plan moved. In the
  // move-to-Black case this notice is the only thing standing between a free company and being
  // charged indefinitely, and it must not arrive under a green "Changed".
  return outcome.billingSettled ? { ok: outcome.message } : { error: outcome.message };
}

export async function addBranch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!companyId) return { error: "Missing company." };
  if (!name) return { error: "Enter a branch name." };

  const supabase = await createClient();

  // Refuse a duplicate NAME rather than letting two "Cardiff1" branches exist: every register,
  // every import and every report identifies a branch to a human by its name.
  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", name)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: `That company already has a branch called ${name}.` };
  }

  const { data: branch, error } = await supabase
    .from("branches")
    .insert({ company_id: companyId, name, kind: "branch" })
    .select("id, name")
    .single();
  if (error) return { error: error.message };

  // Bill it. Best effort by contract: a Stripe hiccup must never leave the founder unsure
  // whether the branch was created, so the branch stands and the reconcile picks it up.
  const billed = await syncBranchQuantity(companyId);

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "branch.created",
    entityType: "branch",
    entityId: branch.id as string,
    summary: `Added the branch ${branch.name}`,
    metadata: { billed: billed.synced, billing_reason: billed.reason ?? null, quantity: billed.quantity ?? null },
  });

  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/settings/branches");
  return {
    ok: billed.synced && billed.quantity !== undefined && billed.quantity > 0
      ? `Added ${branch.name}. Billing updated to ${billed.quantity} extra branch${billed.quantity === 1 ? "" : "es"}.`
      : `Added ${branch.name}.`,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { syncSeatQuantity } from "@/lib/billing/stripe-sync";
import { uploadCompanyLogo } from "@/lib/invoicing/logo";
import { rebakeFormFieldOptions } from "@/lib/forms/rebake-options";
import {
  createAndSendInvite,
  resendInvite,
  revokeInvite,
  type Actor,
  type InviteRole,
} from "@/lib/invites";
import {
  INVITE_DOMAIN_LIMIT,
  normaliseInviteDomain,
  readInviteDomains,
} from "@/lib/invite-domains";
import type { ActionState } from "@/lib/forms";

const INVITABLE_ROLES: InviteRole[] = [
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "on_call",
  "team_member",
];

async function adminContext(): Promise<
  | { ok: true; companyId: string; actor: Actor }
  | { ok: false; error: string }
> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) {
    return { ok: false, error: "The Founder manages companies from the Founder console." };
  }
  return {
    ok: true,
    companyId: profile.company_id,
    actor: {
      id: user.id,
      name: profile.full_name || profile.email,
      email: profile.email,
      role: profile.role,
    },
  };
}

/** Company Admin uploads the company logo (Branding). Used on invoices and any
 *  other branded document. Not tied to the Invoicing feature. */
export async function saveCompanyLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > 2_000_000) return { error: "Please use a logo under 2MB." };

  const up = await uploadCompanyLogo(ctx.companyId, file);
  if (!up.ok) return { error: "Could not upload the logo. Please try again." };
  const admin = createServiceClient();
  const { error } = await admin.from("companies").update({ logo_path: up.path }).eq("id", ctx.companyId);
  if (error) return { error: "Could not save the logo. Please try again." };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.logo_updated",
    entityType: "company",
    entityId: ctx.companyId,
    summary: "Updated company logo",
  });
  revalidatePath("/settings/branding");
  return { ok: "Logo saved" };
}

/** Admin invites a Manager, Supervisor or Team Member into a branch. */
export async function inviteUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as InviteRole;
  const branchId = String(formData.get("branch_id") ?? "").trim();

  if (!INVITABLE_ROLES.includes(role)) {
    return { error: "Only the Founder can create Company Admins. Choose one of the available roles." };
  }
  if (!branchId) {
    return { error: "Choose a branch for this person." };
  }

  const supabase = await createClient();

  // The branch must belong to the admin's company (defence in depth over RLS).
  const { data: branch } = await supabase
    .from("branches")
    .select("id, company_id, status")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch || branch.company_id !== ctx.companyId || branch.status !== "active") {
    return { error: "That branch is not valid for your company." };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name, invite_email_domains")
    .eq("id", ctx.companyId)
    .maybeSingle();

  /**
   * THE ONE PLACE the invite email domain allowlist is enforced (0149): the
   * invite an Admin types by hand on this screen. It is passed in rather than
   * read inside createAndSendInvite so that the automatic Team Member invite
   * (lib/staff/invite.ts) and the Founder invite path cannot pick it up by
   * accident. An empty list means the feature is off.
   */
  const outcome = await createAndSendInvite({
    companyId: ctx.companyId,
    companyName: company?.name ?? "your company",
    branchId,
    email,
    fullName,
    role,
    inviter: ctx.actor,
    enforceEmailDomains: readInviteDomains(company?.invite_email_domains),
  });

  if (!outcome.ok) return { error: outcome.error };

  revalidatePath("/settings/users");
  if (!outcome.emailSent) {
    return {
      ok: `Invite recorded, but the email was not sent (${outcome.emailNote ?? "email not configured"}). Use Resend once email is configured.`,
    };
  }
  return { ok: `Invite emailed to ${email}.` };
}

export async function resendInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return { error: "Missing invite." };
  const outcome = await resendInvite(inviteId, ctx.actor);
  revalidatePath("/settings/users");
  if (!outcome.ok) return { error: outcome.error };
  if (!outcome.emailSent) {
    return { ok: `Invite updated, but the email was not sent (${outcome.emailNote ?? "email not configured"}).` };
  }
  return { ok: "Invite resent." };
}

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return { error: "Missing invite." };
  const outcome = await revokeInvite(inviteId, ctx.actor);
  revalidatePath("/settings/users");
  if (!outcome.ok) return { error: outcome.error };
  return { ok: "Invite revoked." };
}

/**
 * INVITE EMAIL DOMAIN ALLOWLIST (Phil, 2026-07-29, migration 0149).
 *
 * Read the company's list, whatever the row holds, alongside the admin check.
 * Kept private to this file: nothing else writes it, and a "use server" file may
 * only EXPORT async functions, so this stays unexported.
 */
async function readCompanyInviteDomains(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("invite_email_domains")
    .eq("id", companyId)
    .maybeSingle();
  return readInviteDomains(data?.invite_email_domains);
}

/** Write the list back, surfacing an RLS no-op rather than pretending it saved. */
async function saveCompanyInviteDomains(
  companyId: string,
  domains: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ invite_email_domains: domains })
    .eq("id", companyId)
    .select("id");
  if (error) return { ok: false, error: "Could not save that. Please try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Only an Admin can change the allowed email domains." };
  }
  return { ok: true };
}

/**
 * Admin adds a domain to the allowlist used by the invite form on Settings >
 * Users. Accepts "sunrisecare.co.uk" or "@sunrisecare.co.uk", stores it
 * normalised. Adding the first domain is what switches the feature on.
 */
export async function addInviteDomain(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const parsed = normaliseInviteDomain(String(formData.get("domain") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const current = await readCompanyInviteDomains(ctx.companyId);
  if (current.includes(parsed.domain)) {
    return { error: `${parsed.domain} is already on the list.` };
  }
  if (current.length >= INVITE_DOMAIN_LIMIT) {
    return {
      error: `You can hold up to ${INVITE_DOMAIN_LIMIT} domains. Remove one before adding another.`,
    };
  }

  const next = [...current, parsed.domain].sort();
  const saved = await saveCompanyInviteDomains(ctx.companyId, next);
  if (!saved.ok) return { error: saved.error };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.invite_domains_updated",
    entityType: "company",
    entityId: ctx.companyId,
    summary: `Added ${parsed.domain} to the allowed invite email domains`,
    metadata: { added: parsed.domain, domains: next },
  });

  revalidatePath("/settings/users");
  return { ok: `${parsed.domain} added.` };
}

/**
 * Admin removes a domain. Removing the last one turns the feature off again and
 * every address is accepted, which is the state a company starts in.
 */
export async function removeInviteDomain(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  if (!domain) return { error: "Missing domain." };

  const current = await readCompanyInviteDomains(ctx.companyId);
  if (!current.includes(domain)) return { error: "That domain is not on the list." };

  const next = current.filter((d) => d !== domain);
  const saved = await saveCompanyInviteDomains(ctx.companyId, next);
  if (!saved.ok) return { error: saved.error };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.invite_domains_updated",
    entityType: "company",
    entityId: ctx.companyId,
    summary:
      next.length === 0
        ? `Removed ${domain}, so any email address can be invited again`
        : `Removed ${domain} from the allowed invite email domains`,
    metadata: { removed: domain, domains: next },
  });

  revalidatePath("/settings/users");
  return { ok: `${domain} removed.` };
}

/** Enable or disable an existing user in the admin's company. */
export async function setUserStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["active", "disabled"].includes(status)) return { error: "Choose a valid status." };
  if (userId === ctx.actor.id) return { error: "You cannot change your own status here." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.company_id !== ctx.companyId) return { error: "User not found." };
  if (target.role === "company_admin" || target.role === "platform_admin") {
    return { error: "Admins are managed separately." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "user.status_changed",
    entityType: "profile",
    entityId: userId,
    summary: `Set user status to ${status}`,
    metadata: { status },
  });
  // Enabling/disabling a user changes who should appear in the Form dropdowns that
  // offer the company's staff, so re-bake them (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(ctx.companyId);
  // Enabling/disabling a user changes the active seat count: sync to Stripe
  // (best-effort, no-op if unbilled or Black).
  await syncSeatQuantity(ctx.companyId);
  revalidatePath("/settings/users");
  return { ok: status === "disabled" ? "User disabled." : "User enabled." };
}

/** Save a team member's role, Primary Branch and Additional Branch Views in one go.
 *  Primary = auto-fill branch (their name appears when that branch is chosen on Add).
 *  Additional views = branches they can see but are not auto-filled into. */
export async function saveTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as InviteRole;
  const primary = String(formData.get("primary_branch_id") ?? "").trim();
  const additional = formData.getAll("additional_branch_ids").map(String).filter(Boolean);

  if (!userId) return { error: "Missing user." };
  if (!INVITABLE_ROLES.includes(role)) return { error: "Choose a valid role." };
  if (userId === ctx.actor.id) return { error: "You cannot edit your own account here." };
  if (!primary) return { error: "Choose a primary branch." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.company_id !== ctx.companyId) return { error: "User not found." };
  if (target.role === "company_admin" || target.role === "platform_admin") {
    return { error: "Admins are managed separately." };
  }

  // Validate every branch belongs to this company and is an active branch (not office).
  const wanted = Array.from(new Set([primary, ...additional]));
  const { data: validBranches } = await supabase
    .from("branches")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .in("id", wanted);
  const validSet = new Set((validBranches ?? []).map((b) => b.id as string));
  if (!validSet.has(primary)) return { error: "Choose a valid primary branch." };
  const cleanAdditional = additional.filter((id) => id !== primary && validSet.has(id));

  // Role.
  const { error: roleErr } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (roleErr) return { error: roleErr.message };

  // Replace the branch rows: one primary + the additional views.
  await supabase.from("user_branches").delete().eq("user_id", userId);
  const rows = [
    { user_id: userId, branch_id: primary, is_primary: true },
    ...cleanAdditional.map((id) => ({ user_id: userId, branch_id: id, is_primary: false })),
  ];
  const { error: insErr } = await supabase.from("user_branches").insert(rows);
  if (insErr) return { error: insErr.message };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "user.updated",
    entityType: "profile",
    entityId: userId,
    summary: "Updated role and branches",
    metadata: { role, primary_branch_id: primary, additional_branch_ids: cleanAdditional },
  });
  revalidatePath("/settings/users");
  return { ok: "Saved" };
}

/** Permanently delete a team member (removes their login and all their assignments). */
export async function deleteUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "Missing user." };
  if (userId === ctx.actor.id) return { error: "You cannot delete your own account." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role, email")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.company_id !== ctx.companyId) return { error: "User not found." };
  if (target.role === "company_admin" || target.role === "platform_admin") {
    return { error: "Admins cannot be deleted here." };
  }

  // Deleting the auth user cascades the profile, branch rows and assignments.
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[deleteUser] failed:", error.message);
    return { error: `The user could not be deleted: ${error.message}` };
  }

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "user.deleted",
    entityType: "profile",
    entityId: userId,
    summary: `Deleted user ${target.email}`,
  });
  // They must stop being offered as an option on any Form that lists the company's
  // staff (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(ctx.companyId);
  // Removing a user drops the active seat count: sync down to Stripe.
  await syncSeatQuantity(ctx.companyId);
  revalidatePath("/settings/users");
  return { ok: "User deleted.", redirectTo: "/settings/users" };
}

/** Change a user's role (within the non-admin roles). */
export async function changeUserRole(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx.ok) return;
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as InviteRole;
  if (!userId || !INVITABLE_ROLES.includes(role)) return;
  if (userId === ctx.actor.id) return;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.company_id !== ctx.companyId) return;
  if (target.role === "company_admin" || target.role === "platform_admin") return;

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return;

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "user.role_changed",
    entityType: "profile",
    entityId: userId,
    summary: `Changed user role to ${role}`,
    metadata: { role },
  });
  revalidatePath("/settings/users");
}

/** Rename one of the company's branches and set its office address (printed in
 *  full on formal meeting letters when the Location is Office, migration 0050).
 *  Returns ActionState so the button can show Saving, Saved and real errors:
 *  a save must never be silent (standing rule, Phil 2026-07-12). */
export async function renameBranch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: "You do not have permission to edit branches." };
  const branchId = String(formData.get("branch_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim().slice(0, 400);
  if (!branchId || !name) return { error: "The branch needs a name." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("branches")
    .update({ name, address: address || null }, { count: "exact" })
    .eq("id", branchId)
    .eq("company_id", ctx.companyId);
  if (error) return { error: `The branch could not be saved: ${error.message}` };
  if (!count) return { error: "The branch could not be saved: no matching branch." };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "branch.renamed",
    entityType: "branch",
    entityId: branchId,
    summary: `Updated branch ${name}`,
    metadata: { name, address: address || null },
  });
  // Every Form field keyed branch or region carries a baked copy of the branch names
  // (migration 0076), so a rename leaves them offering the old one until we re-bake
  // (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(ctx.companyId);
  revalidatePath("/settings/branches");
  return { ok: "Saved." };
}

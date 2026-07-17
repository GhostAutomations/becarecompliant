"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { syncSeatQuantity } from "@/lib/billing/stripe-sync";
import {
  createAndSendInvite,
  resendInvite,
  revokeInvite,
  type Actor,
  type InviteRole,
} from "@/lib/invites";
import type { ActionState } from "@/lib/forms";

const INVITABLE_ROLES: InviteRole[] = [
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
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
    .select("name")
    .eq("id", ctx.companyId)
    .maybeSingle();

  const outcome = await createAndSendInvite({
    companyId: ctx.companyId,
    companyName: company?.name ?? "your company",
    branchId,
    email,
    fullName,
    role,
    inviter: ctx.actor,
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
  // Enabling/disabling a user changes the active seat count: sync to Stripe
  // (best-effort, no-op if unbilled/Diamond/Black).
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
  revalidatePath("/settings/branches");
  return { ok: "Saved." };
}

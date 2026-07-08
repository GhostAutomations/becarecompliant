"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  createAndSendInvite,
  resendInvite,
  revokeInvite,
  type Actor,
  type InviteRole,
} from "@/lib/invites";
import type { ActionState } from "@/lib/forms";

const INVITABLE_ROLES: InviteRole[] = ["manager", "supervisor", "team_member"];

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
    return { error: "Only the Founder can create Company Admins. Choose Manager, Supervisor or Team Member." };
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

export async function resendInviteAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx.ok) return;
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return;
  await resendInvite(inviteId, ctx.actor);
  revalidatePath("/settings/users");
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx.ok) return;
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return;
  await revokeInvite(inviteId, ctx.actor);
  revalidatePath("/settings/users");
}

/** Enable or disable an existing user in the admin's company. */
export async function setUserStatus(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx.ok) return;
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["active", "disabled"].includes(status)) return;
  if (userId === ctx.actor.id) return; // never disable yourself

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
    .update({ status })
    .eq("id", userId);
  if (error) return;

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
  revalidatePath("/settings/users");
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

/** Rename one of the company's branches. */
export async function renameBranch(formData: FormData): Promise<void> {
  const ctx = await adminContext();
  if (!ctx.ok) return;
  const branchId = String(formData.get("branch_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!branchId || !name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ name })
    .eq("id", branchId)
    .eq("company_id", ctx.companyId);
  if (error) return;

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "branch.renamed",
    entityType: "branch",
    entityId: branchId,
    summary: `Renamed branch to ${name}`,
    metadata: { name },
  });
  revalidatePath("/settings/branches");
}

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
import { picksABranch, mayChooseAllBranches, ALL_BRANCHES } from "@/lib/people/roles";
import { trialState } from "@/lib/billing/trial";
import { trialInviteRefusal } from "@/lib/billing/trial-limits";
import { isBillableSeat } from "@/lib/billing/seats";
import { MODULES, isLocked } from "@/lib/auth/module-catalogue";
import { canCopyRole, deleteRefusal, parseRoleChoice } from "@/lib/auth/custom-roles";
import { companyRoles } from "@/lib/auth/module-access";
import { sendPasswordReset } from "@/lib/auth/password-reset";
import { RESET_THROTTLE_MINUTES } from "@/lib/auth/password-reset-rules";
import { PORTAL_FORMS, portalFormKey } from "@/lib/auth/portal-forms";
import { ROLE_LABELS } from "@/lib/nav";

const INVITABLE_ROLES: InviteRole[] = [
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
  "on_call",
  "team_member",
];

/**
 * The roles an Admin may move an EXISTING user onto: the invitable ones, plus the carer login.
 *
 * 'staff' is here and not in INVITABLE_ROLES because the two questions differ. A Team Member
 * account is CREATED from the People register when a carer is added with an email
 * (lib/staff/invite.ts), never typed into the invite form — but the user editor has offered
 * "Team Member" in its role list for months while the check behind it used INVITABLE_ROLES, so
 * saving any change to a carer's login came back "Choose a valid role." An option offered and
 * then refused is the same defect as a ticked box that does nothing (DEF-032).
 */
const EDITABLE_ROLES: InviteRole[] = [...INVITABLE_ROLES, "staff"];

/**
 * ONE `role` FIELD, whether they picked a built-in role or one their company named (0314).
 *
 * Every role picker on the product posts a single value: "supervisor", or "custom:<id>" for a
 * company's own role. It is split here into the built-in role — which is what goes in
 * profiles.role and what every policy reads — and the custom role beside it.
 *
 * A value naming a custom role this company does not have comes back null and is refused, rather
 * than being quietly treated as the built-in role it looked like.
 */
async function chooseRole(
  raw: string,
  companyId: string,
  allowed: InviteRole[] = INVITABLE_ROLES,
): Promise<{ role: InviteRole; companyRoleId: string | null } | null> {
  const parsed = parseRoleChoice(raw, await companyRoles(companyId));
  if (!parsed) return null;
  if (!allowed.includes(parsed.role as InviteRole)) return null;
  return { role: parsed.role as InviteRole, companyRoleId: parsed.companyRoleId };
}

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
  const branchId = String(formData.get("branch_id") ?? "").trim();
  // Delayed invites (Phil, 2026-08-19): create it, tell them later.
  const holdEmail = String(formData.get("hold_email") ?? "") === "1";

  if (!fullName) {
    return { error: "Enter their full name. It appears on the records and reports they sign." };
  }
  const chosen = await chooseRole(String(formData.get("role") ?? ""), ctx.companyId);
  if (!chosen) {
    return { error: "Only the Founder can create Company Admins. Choose one of the available roles." };
  }
  const { role, companyRoleId } = chosen;
  /* Company wide roles (Responsible Individual, Registered Manager — and Company Admin, which
     only the founder can invite) reach every branch in RLS, so a branch is not merely optional
     for them, it is meaningless. Requiring one wrote a primary branch that made an RI look like
     they belonged to Cardiff. */
  /* "All branches" is a deliberate choice, not an empty one. Only a role that is allowed to
     make it may post it — otherwise a hand-crafted form could hand somebody an unscoped account
     by typing "all" into the branch field. */
  const choseAll = branchId === ALL_BRANCHES && mayChooseAllBranches(role);
  if (branchId === ALL_BRANCHES && !choseAll) {
    return { error: "That role has to be given a branch." };
  }
  const noBranch = !picksABranch(role) || choseAll;
  if (!noBranch && !branchId) {
    return { error: "Choose a branch for this person." };
  }

  const supabase = await createClient();

  /* THE TRIAL LIMIT (Phil, 2026-08-20): a trial is the Admin and two colleagues. This is the one
     place the product says no about seats, and it always names the way out. Read the trial state
     from the same single column the lock reads (companies.trial_ends_at) — a subscription clears
     it, so a paying company is never refused. */
  const { data: trialCo } = await supabase
    .from("companies")
    .select("tier, trial_ends_at")
    .eq("id", ctx.companyId)
    .maybeSingle();
  const trial = trialState({
    trialEndsAt: (trialCo as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null,
    tier: (trialCo as { tier?: string | null } | null)?.tier ?? undefined,
  });
  if (trial.status !== "none") {
    const [{ data: seatRows }, { data: pendingRows }] = await Promise.all([
      supabase.from("profiles").select("role, status").eq("company_id", ctx.companyId),
      supabase.from("invites").select("role").eq("company_id", ctx.companyId).eq("status", "pending"),
    ]);
    const refusal = trialInviteRefusal({
      onTrial: true,
      /* ACTIVE ONLY, and this is not fussiness: every pending invitation ALSO has a profile row
         with status 'invited' (createAndSendInvite promotes it), so counting "not disabled" here
         and pending invites below counted the same person twice. Live proof, 2026-08-20: a fresh
         trial with only the Admin's own invitation outstanding refused the SECOND colleague
         instead of the third. */
      activeBillable: ((seatRows ?? []) as { role: string; status: string }[]).filter(
        (u) => u.status === "active" && isBillableSeat(u.role),
      ).length,
      pendingBillable: ((pendingRows ?? []) as { role: string }[]).filter((i) =>
        isBillableSeat(i.role),
      ).length,
    });
    if (refusal) return { error: refusal };
  }

  // The branch must belong to the admin's company (defence in depth over RLS). Skipped for a
  // company wide role, which has no branch to check — and a stray branch_id posted with one is
  // ignored below rather than trusted.
  if (!noBranch) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, company_id, status")
      .eq("id", branchId)
      .maybeSingle();
    if (!branch || branch.company_id !== ctx.companyId || branch.status !== "active") {
      return { error: "That branch is not valid for your company." };
    }
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
    // NULL for a company wide role, whatever the form posted: nothing should record them as
    // belonging to one branch.
    branchId: noBranch ? null : branchId,
    allBranches: choseAll,
    email,
    fullName,
    role,
    companyRoleId,
    inviter: ctx.actor,
    enforceEmailDomains: readInviteDomains(company?.invite_email_domains),
    sendEmail: !holdEmail,
  });

  if (!outcome.ok) return { error: outcome.error };

  revalidatePath("/settings/users");
  /* A held invite and a FAILED send both arrive here with emailSent false, and they mean
     opposite things: one is what you asked for, the other is a problem. Say which. */
  if (holdEmail) {
    return {
      ok: `${fullName} has been added. Nothing has been emailed — press Send invite below when you are ready.`,
    };
  }
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
  // Also the SEND button for a held invite: same send, and lib/invites stamps email_sent_at.
  const outcome = await resendInvite(inviteId, ctx.actor);
  revalidatePath("/settings/users");
  if (!outcome.ok) return { error: outcome.error };
  if (!outcome.emailSent) {
    return { ok: `Invite updated, but the email was not sent (${outcome.emailNote ?? "email not configured"}).` };
  }
  return { ok: "Invite sent." };
}

/** Send every invite that was created with the email held back. */
export async function sendHeldInvitesAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .select("id, email")
    .eq("company_id", ctx.companyId)
    .eq("status", "pending")
    .is("email_sent_at", null);
  if (error) return { error: error.message };

  const held = (data ?? []) as { id: string; email: string }[];
  if (held.length === 0) return { error: "There are no held invites to send." };

  let sent = 0;
  const failed: string[] = [];
  for (const invite of held) {
    const outcome = await resendInvite(invite.id, ctx.actor);
    // A send that did not actually go out is a failure, whatever the reason. Counting it as
    // sent would leave somebody waiting for an email nobody will ever receive.
    if (outcome.ok && outcome.emailSent) sent += 1;
    else failed.push(invite.email);
  }

  revalidatePath("/settings/users");
  if (failed.length) {
    return {
      error:
        `${sent} of ${held.length} sent. These did not go and are still waiting: ` +
        failed.join(", "),
    };
  }
  return { ok: `${sent} invite${sent === 1 ? "" : "s"} sent.` };
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
  const primary = String(formData.get("primary_branch_id") ?? "").trim();
  const additional = formData.getAll("additional_branch_ids").map(String).filter(Boolean);

  if (!userId) return { error: "Missing user." };
  const chosen = await chooseRole(String(formData.get("role") ?? ""), ctx.companyId, EDITABLE_ROLES);
  if (!chosen) return { error: "Choose a valid role." };
  const { role, companyRoleId } = chosen;
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

  /* Role, and the company's own role beside it. Both in ONE update, because the trigger in 0314
     refuses a pair that disagrees: setting them one at a time would fail halfway through on any
     move between two roles. Moving to a built-in role clears the custom one rather than leaving
     a name pointing at something they no longer are. */
  const { error: roleErr } = await supabase
    .from("profiles")
    .update({ role, company_role_id: companyRoleId })
    .eq("id", userId);
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

  /*
   * Their invitation goes with them. It used to be left pending, and a pending invite whose
   * account has been deleted is not dormant: Resend found the address free, minted a brand new
   * auth user with no company and no role, and sent them a link into a dead end while the screen
   * said "Invite resent." Service role, because the profile this would have been scoped through
   * has just been cascaded away.
   */
  const { data: revoked, error: revokeErr } = await admin
    .from("invites")
    .update({ status: "revoked" })
    .eq("company_id", ctx.companyId)
    .eq("email", target.email as string)
    .eq("status", "pending")
    .select("id");
  if (revokeErr) {
    console.error("[deleteUser] pending invite not revoked:", revokeErr.message);
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
    // Without this, "why did this invitation stop working" has no answer: the invite is revoked
    // and nothing anywhere says who did it or when.
    metadata: { invites_revoked: (revoked ?? []).map((r) => r.id as string) },
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
  const chosen = await chooseRole(String(formData.get("role") ?? ""), ctx.companyId, EDITABLE_ROLES);
  if (!userId || !chosen) return;
  const { role, companyRoleId } = chosen;
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
    .update({ role, company_role_id: companyRoleId })
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
 *  A branch with no premises of its own SHARES the office address instead of
 *  holding a copy (migration 0222), so the copy is cleared when it is ticked.
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
  /* The kind is read here, not trusted from the post: the office cannot share an
     address with itself, and a branch that shares one must not keep a stale copy. */
  const { data: existing } = await supabase
    .from("branches")
    .select("kind")
    .eq("id", branchId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!existing) return { error: "The branch could not be saved: no matching branch." };
  const sharesOffice =
    existing.kind !== "team" && formData.get("uses_office_address") === "on";

  const { error, count } = await supabase
    .from("branches")
    .update(
      {
        name,
        uses_office_address: sharesOffice,
        address: sharesOffice ? null : address || null,
      },
      { count: "exact" },
    )
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
    metadata: {
      name,
      address: sharesOffice ? null : address || null,
      uses_office_address: sharesOffice,
    },
  });
  // Every Form field keyed branch or region carries a baked copy of the branch names
  // (migration 0076), so a rename leaves them offering the old one until we re-bake
  // (best-effort, see rebake-options.ts).
  await rebakeFormFieldOptions(ctx.companyId);
  revalidatePath("/settings/branches");
  return { ok: "Saved." };
}


/**
 * Save which departments a role opens (Phil, 2026-09-17).
 *
 * WHAT IS POSTED is the ticks that are ON, one `role|module` per checkbox, exactly as the browser
 * sends checkboxes: unticked boxes send nothing. So the OFF rows are worked out here by
 * subtracting what arrived from the ceiling, rather than trusting the form to tell us what to
 * switch off. A form that posted the off list would, on a dropped field, quietly switch a
 * department ON for a role.
 *
 * THE CEILING IS APPLIED AGAIN, server side. A tick for something outside a role's ceiling is
 * ignored rather than refused: the screen greys those out, so a post carrying one is either a
 * stale page or somebody poking at the form, and neither should be able to widen anything.
 *
 * One role at a time, so a save touches only that role's rows and two Admins on two tiles cannot
 * overwrite each other.
 */
export async function saveRoleModules(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };

  const role = String(formData.get("role") ?? "").trim();
  if (!role) return { error: "Missing role." };
  if (!MODULES.some((m) => m.roles.includes(role))) {
    return { error: "That is not a role we recognise." };
  }

  const ticked = new Set(formData.getAll("modules").map((v) => String(v)));
  const offKeys = MODULES
    .filter((m) => m.roles.includes(role) && !isLocked(m.key, role) && !ticked.has(m.key))
    .map((m) => m.key);

  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from("company_role_modules")
    .delete()
    .eq("company_id", companyId)
    .eq("role", role);
  if (delErr) return { error: delErr.message };

  if (offKeys.length > 0) {
    const { error: insErr } = await supabase.from("company_role_modules").insert(
      offKeys.map((module_key) => ({
        company_id: companyId,
        role,
        module_key,
        disabled_by: user.id,
      })),
    );
    if (insErr) return { error: insErr.message };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.role_access_set",
    entityType: "company",
    entityId: companyId,
    summary: `${ROLE_LABELS[role] ?? role}: ${offKeys.length === 0 ? "every department" : `${offKeys.length} switched off`}`,
    metadata: { role, switched_off: offKeys },
  });

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}


/* ===========================================================================
 * A COMPANY'S OWN ROLES (0314). Phil, 2026-09-21: "lets add the roles to users and access."
 *
 * A custom role is a NAMED NARROWING of a built-in role: the person keeps the built-in role in
 * profiles.role, which is what every policy reads and what decides their branch reach, and
 * carries the custom role beside it for its name and the departments it switches off. Nothing
 * here can widen anything, by construction — see lib/auth/custom-roles.ts.
 * =========================================================================== */

/** Make a role: a name, and the built-in role it copies. */
export async function createCompanyRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const name = String(formData.get("name") ?? "").trim();
  const baseRole = String(formData.get("base_role") ?? "").trim();
  if (name.length < 2) return { error: "Give the role a name of at least two letters." };
  if (name.length > 40) return { error: "That name is too long. Forty characters at most." };
  if (!canCopyRole(baseRole)) {
    return { error: "Choose the role it starts from. Admins and carer logins cannot be copied." };
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("company_roles")
    .insert({ company_id: ctx.companyId, name, base_role: baseRole, created_by: ctx.actor.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: `You already have a role called ${name}.` };
    return { error: error.message };
  }

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.role_created",
    entityType: "company_role",
    entityId: (created as { id: string }).id,
    summary: `Created the role ${name}, copied from ${ROLE_LABELS[baseRole] ?? baseRole}`,
    metadata: { name, base_role: baseRole },
  });

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: `${name} created. It starts with everything ${ROLE_LABELS[baseRole] ?? baseRole} has — untick what it must not reach.` };
}

/**
 * Rename one. THE ROLE IT COPIES IS NOT EDITABLE, on purpose: changing it would change what
 * every person on that role can reach, from a screen that looks like it is changing a word.
 */
export async function renameCompanyRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const id = String(formData.get("company_role_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { error: "Missing role." };
  if (name.length < 2) return { error: "Give the role a name of at least two letters." };
  if (name.length > 40) return { error: "That name is too long. Forty characters at most." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_roles")
    .update({ name })
    .eq("id", id)
    .eq("company_id", ctx.companyId);
  if (error) {
    if (error.code === "23505") return { error: `You already have a role called ${name}.` };
    return { error: error.message };
  }

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.role_renamed",
    entityType: "company_role",
    entityId: id,
    summary: `Renamed a role to ${name}`,
    metadata: { name },
  });

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

/**
 * Save which departments one of the company's own roles opens.
 *
 * The same subtraction as saveRoleModules: the form posts what is ON and the OFF rows are worked
 * out by taking those away from the ceiling, so a dropped field can only switch something OFF,
 * never on. The ceiling is the BASE ROLE'S ceiling, applied again server side: a tick for
 * something the base role never had is ignored.
 */
export async function saveCompanyRoleModules(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const id = String(formData.get("company_role_id") ?? "").trim();
  if (!id) return { error: "Missing role." };

  const supabase = await createClient();
  const { data: roleRow } = await supabase
    .from("company_roles")
    .select("id, name, base_role")
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!roleRow) return { error: "That role was not found." };
  const base = (roleRow as { base_role: string }).base_role;

  const ticked = new Set(formData.getAll("modules").map((v) => String(v)));
  const offKeys = MODULES
    .filter((m) => m.roles.includes(base) && !isLocked(m.key, base) && !ticked.has(m.key))
    .map((m) => m.key);

  const { error: delErr } = await supabase
    .from("company_role_modules_off")
    .delete()
    .eq("company_role_id", id);
  if (delErr) return { error: delErr.message };

  if (offKeys.length > 0) {
    const { error: insErr } = await supabase.from("company_role_modules_off").insert(
      offKeys.map((module_key) => ({
        company_role_id: id,
        module_key,
        disabled_by: ctx.actor.id,
      })),
    );
    if (insErr) return { error: insErr.message };
  }

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.role_access_set",
    entityType: "company_role",
    entityId: id,
    summary: `${(roleRow as { name: string }).name}: ${offKeys.length === 0 ? "every department its base role has" : `${offKeys.length} switched off`}`,
    metadata: { company_role_id: id, base_role: base, switched_off: offKeys },
  });

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

/**
 * Delete one. REFUSED WHILE ANYBODY IS ON IT (Phil, asked and answered 2026-09-21): deleting it
 * and letting those people fall back to the built-in role would hand them back every department
 * the role had switched off, silently, which is the opposite of what Delete means.
 *
 * The database says the same thing — profiles.company_role_id is ON DELETE RESTRICT — so the
 * count here is for the message, not for the safety.
 */
export async function deleteCompanyRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };

  const id = String(formData.get("company_role_id") ?? "").trim();
  if (!id) return { error: "Missing role." };

  const supabase = await createClient();
  const { data: roleRow } = await supabase
    .from("company_roles")
    .select("id, name")
    .eq("id", id)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!roleRow) return { error: "That role was not found." };
  const name = (roleRow as { name: string }).name;

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.companyId)
    .eq("company_role_id", id);
  const refusal = deleteRefusal(name, count ?? 0);
  if (refusal) return { error: refusal };

  const { error } = await supabase
    .from("company_roles")
    .delete()
    .eq("id", id)
    .eq("company_id", ctx.companyId);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.actor.id,
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: "company.role_deleted",
    entityType: "company_role",
    entityId: id,
    summary: `Deleted the role ${name}`,
    metadata: { name },
  });

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: `${name} deleted.` };
}


/**
 * Save what a Team Member may fill in from their portal (Phil, 2026-09-17).
 *
 * A SECOND ACTION rather than a flag on saveRoleModules, because it is a different question with
 * different rules: departments have a ceiling per role, portal forms have availability and a lock,
 * and folding them together would mean one function where half the arguments are ignored
 * depending on the other half.
 *
 * Same subtraction as the departments: the form posts what is ON, and what is switched off is
 * whatever is left. A form that posted the off list would, on a dropped field, quietly switch
 * something on.
 */
export async function savePortalForms(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };

  const ticked = new Set(formData.getAll("forms").map((v) => String(v)));
  const offKeys = PORTAL_FORMS
    .filter((f) => f.available && !f.locked && !ticked.has(f.key))
    .map((f) => portalFormKey(f.key));

  const supabase = await createClient();
  /* The whole area, which is a DEPARTMENT row rather than a form row. One tile owns both, so one
     save owns both: clearing only the form rows would leave the portal switched off with every
     form ticked, which is a state no screen would explain. */
  const portalOn = String(formData.get("portal") ?? "") === "on";
  const { error: delErr } = await supabase
    .from("company_role_modules")
    .delete()
    .eq("company_id", companyId)
    .eq("role", "staff");
  if (delErr) return { error: delErr.message };

  if (!portalOn) offKeys.push("team_portal");

  if (offKeys.length > 0) {
    const { error: insErr } = await supabase.from("company_role_modules").insert(
      offKeys.map((module_key) => ({
        company_id: companyId,
        role: "staff",
        module_key,
        disabled_by: user.id,
      })),
    );
    if (insErr) return { error: insErr.message };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.portal_forms_set",
    entityType: "company",
    entityId: companyId,
    summary: portalOn
      ? `Team Portal: ${offKeys.length === 0 ? "every form" : `${offKeys.length} switched off`}`
      : "Team Portal switched off",
    metadata: { switched_off: offKeys },
  });

  revalidatePath("/settings/users");
  revalidatePath("/my");
  return { ok: "Saved." };
}

/**
 * An Admin sends somebody a password reset (2026-09-23). The same email and the same one door as
 * the "Forgot your password?" link. Unlike that public form, the Admin is told what happened,
 * because they can already see the person in their own list.
 */
export async function sendUserPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await adminContext();
  if (!ctx.ok) return { error: ctx.error };
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "Missing user." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, email, status")
    .eq("id", userId)
    .maybeSingle();
  // Same company only, read through the Admin's own client, so RLS answers the question too.
  if (!target || target.company_id !== ctx.companyId) return { error: "User not found." };
  if (target.status !== "active") {
    return {
      error:
        target.status === "invited"
          ? "They have not accepted their invitation yet. Resend the invitation instead."
          : "This login is switched off. Enable it first if they should have access.",
    };
  }

  const outcome = await sendPasswordReset({
    email: target.email as string,
    sentBy: { ...ctx.actor, companyId: ctx.companyId },
  });
  if (outcome.sent) return { ok: `Reset email sent to ${outcome.email}.` };
  switch (outcome.reason) {
    case "throttled":
      return { error: `A reset was sent to them in the last ${RESET_THROTTLE_MINUTES} minutes. Ask them to check their inbox and junk folder.` };
    case "email_not_configured":
      return { error: "Email is not set up on this system, so nothing was sent. Contact support." };
    case "unsendable":
      return { error: "That address cannot receive email. Correct it before sending a reset." };
    default:
      return { error: `The reset email could not be sent${outcome.detail ? `: ${outcome.detail}` : "."}` };
  }
}

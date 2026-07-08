import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { inviteEmailHtml, inviteSubject } from "@/lib/email/templates";
import { writeAudit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";
import { ROLE_LABELS } from "@/lib/nav";

export type InviteRole =
  | "company_admin"
  | "manager"
  | "supervisor"
  | "team_member";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type InviteParams = {
  companyId: string;
  companyName: string;
  branchId: string | null;
  email: string;
  fullName: string;
  role: InviteRole;
  inviter: Actor;
};

export type InviteOutcome =
  | { ok: true; emailSent: boolean; emailNote?: string }
  | { ok: false; error: string };

type ServiceClient = ReturnType<typeof createServiceClient>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ACCEPT_NEXT = "/welcome";

/** Build the CTA URL for our own /auth/confirm route (verifyOtp on token_hash).
 *  This is the supported pattern when we send the email ourselves via Resend. */
function confirmUrl(tokenHash: string, type: string): string {
  const u = new URL(`${siteUrl()}/auth/confirm`);
  u.searchParams.set("token_hash", tokenHash);
  u.searchParams.set("type", type);
  u.searchParams.set("next", ACCEPT_NEXT);
  return u.toString();
}

/**
 * Provision (or find) the invitee's auth user and return a one time secure
 * confirm URL. Brand new users get a Supabase "invite" token; users who already
 * exist (a resend, or someone already in the system) fall back to a magic link
 * token. We embed the token_hash in our own confirm URL, not the raw Supabase
 * action link, so verifyOtp can complete the sign in server side.
 */
async function generateConfirmUrl(
  admin: ServiceClient,
  email: string,
  fullName: string,
): Promise<{ url: string | null; userId: string | null; error?: string }> {
  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName } },
  });
  const inviteHash = invite.data?.properties?.hashed_token;
  if (!invite.error && inviteHash) {
    return { url: confirmUrl(inviteHash, "invite"), userId: invite.data.user?.id ?? null };
  }

  const magic = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const magicHash = magic.data?.properties?.hashed_token;
  if (!magic.error && magicHash) {
    return { url: confirmUrl(magicHash, "magiclink"), userId: magic.data.user?.id ?? null };
  }

  return {
    url: null,
    userId: null,
    error:
      magic.error?.message ??
      invite.error?.message ??
      "Could not create the invitation link.",
  };
}

/** Create an invite, provision the user, and send the branded email. */
export async function createAndSendInvite(
  p: InviteParams,
): Promise<InviteOutcome> {
  const email = p.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  let admin: ServiceClient;
  try {
    admin = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = await createClient();

  const link = await generateConfirmUrl(admin, email, p.fullName);
  if (link.error || !link.userId || !link.url) {
    return { ok: false, error: link.error ?? "Could not create the invitation link." };
  }

  // Guard: the person must not already belong to a different active company.
  const { data: existing } = await admin
    .from("profiles")
    .select("company_id, status")
    .eq("id", link.userId)
    .maybeSingle();
  if (
    existing?.company_id &&
    existing.company_id !== p.companyId &&
    existing.status === "active"
  ) {
    return { ok: false, error: "That person already belongs to another company." };
  }

  // Record the invite. RLS re-checks that the caller is an admin (and that a
  // Company Admin cannot mint another company_admin).
  const { data: invite, error: inviteErr } = await supabase
    .from("invites")
    .insert({
      company_id: p.companyId,
      branch_id: p.branchId,
      email,
      full_name: p.fullName,
      role: p.role,
      invited_by: p.inviter.id,
    })
    .select("id")
    .single();
  if (inviteErr) {
    if (inviteErr.code === "23505") {
      return { ok: false, error: "There is already a pending invite for that email." };
    }
    return { ok: false, error: inviteErr.message };
  }

  // Promote the profile to the invited role/company (service role bypasses the
  // protected-fields trigger). Company Admins are implicitly all branches, so
  // only non-admin roles get a user_branches row.
  await admin
    .from("profiles")
    .update({
      company_id: p.companyId,
      role: p.role,
      status: "invited",
      full_name: p.fullName,
    })
    .eq("id", link.userId);

  if (p.branchId && p.role !== "company_admin") {
    await admin
      .from("user_branches")
      .upsert(
        { user_id: link.userId, branch_id: p.branchId },
        { onConflict: "user_id,branch_id" },
      );
  }

  const send = await sendEmail({
    to: email,
    subject: inviteSubject(p.companyName),
    html: inviteEmailHtml({
      companyName: p.companyName,
      inviterName: p.inviter.name || "Your administrator",
      roleLabel: ROLE_LABELS[p.role] ?? p.role,
      actionUrl: link.url,
    }),
  });

  await writeAudit({
    companyId: p.companyId,
    actorId: p.inviter.id,
    actorEmail: p.inviter.email,
    actorRole: p.inviter.role,
    action: "invite.created",
    entityType: "invite",
    entityId: invite.id,
    summary: `Invited ${email} as ${ROLE_LABELS[p.role] ?? p.role}`,
    metadata: {
      email,
      role: p.role,
      branch_id: p.branchId,
      email_sent: send.sent,
    },
  });

  return { ok: true, emailSent: send.sent, emailNote: send.skippedReason ?? send.error };
}

/** Regenerate a link and re-send a pending invite. */
export async function resendInvite(
  inviteId: string,
  actor: Actor,
): Promise<InviteOutcome> {
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("invites")
    .select("id, company_id, email, full_name, role, status, resend_count")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "That invite is no longer pending." };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", invite.company_id)
    .maybeSingle();

  let admin: ServiceClient;
  try {
    admin = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const link = await generateConfirmUrl(admin, invite.email, invite.full_name);
  if (link.error || !link.url) {
    return { ok: false, error: link.error ?? "Could not regenerate the link." };
  }

  const send = await sendEmail({
    to: invite.email,
    subject: inviteSubject(company?.name ?? "your company"),
    html: inviteEmailHtml({
      companyName: company?.name ?? "your company",
      inviterName: actor.name || "Your administrator",
      roleLabel: ROLE_LABELS[invite.role] ?? invite.role,
      actionUrl: link.url,
    }),
  });

  await supabase
    .from("invites")
    .update({
      last_sent_at: new Date().toISOString(),
      resend_count: (invite.resend_count ?? 0) + 1,
    })
    .eq("id", inviteId);

  await writeAudit({
    companyId: invite.company_id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "invite.resent",
    entityType: "invite",
    entityId: invite.id,
    summary: `Resent invite to ${invite.email}`,
    metadata: { email: invite.email, email_sent: send.sent },
  });

  return { ok: true, emailSent: send.sent, emailNote: send.skippedReason ?? send.error };
}

/** Revoke a pending invite and disable the not yet active profile. */
export async function revokeInvite(
  inviteId: string,
  actor: Actor,
): Promise<InviteOutcome> {
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("invites")
    .select("id, company_id, email, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) {
    return { ok: false, error: "Invite not found." };
  }

  const { error } = await supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) {
    return { ok: false, error: error.message };
  }

  try {
    const admin = createServiceClient();
    await admin
      .from("profiles")
      .update({ status: "disabled" })
      .eq("email", invite.email)
      .eq("company_id", invite.company_id)
      .eq("status", "invited");
  } catch (e) {
    console.error("[invites] revoke profile disable skipped:", (e as Error).message);
  }

  await writeAudit({
    companyId: invite.company_id,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "invite.revoked",
    entityType: "invite",
    entityId: invite.id,
    summary: `Revoked invite for ${invite.email}`,
    metadata: { email: invite.email },
  });

  return { ok: true, emailSent: false };
}

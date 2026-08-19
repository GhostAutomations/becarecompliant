import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isSendableAddress, sendEmail } from "@/lib/email/resend";
import { isEmailDomainAllowed, inviteDomainRefusal } from "@/lib/invite-domains";
import { inviteEmailHtml, inviteSubject } from "@/lib/email/templates";
import { writeAudit } from "@/lib/audit";
import { picksABranch } from "@/lib/people/roles";
import { siteUrl } from "@/lib/site";
import { ROLE_LABELS } from "@/lib/nav";

export type InviteRole =
  | "company_admin"
  | "registered_individual"
  | "registered_manager"
  | "manager"
  | "supervisor"
  | "on_call"
  | "team_member"
  /** Carer self-service login, shown as "Team Member". Free seat (0131). */
  | "staff";

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
  /**
   * The company's optional invite email domain allowlist (0149), passed ONLY by
   * the manual invite an Admin types on Settings > Users. Leave it unset and no
   * allowlist check happens at all, which is why the automatic Team Member
   * (staff) invite in lib/staff/invite.ts and the Founder invite path are
   * untouched by the feature. An empty array means the same as unset: off.
   */
  enforceEmailDomains?: readonly string[];
  /**
   * DELAYED INVITES (Phil, 2026-08-19). Set false to create the invitation without telling
   * anybody about it: the account, the invites row and the branch row are all made exactly as
   * usual, and only the email is held. Settings > Users then lists it as "Not sent yet" with a
   * Send invite button, which goes through resendInvite like any other send.
   *
   * The reason it exists: a bulk import of forty carers emails forty people the moment it
   * finishes, and the person doing the import is thinking about data, not about forty replies
   * that evening. Defaults to true so every existing caller behaves as it did.
   */
  sendEmail?: boolean;
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
  /*
   * THIS is the door, not createAndSendInvite. generateLink is what creates the auth user, and
   * the two resend paths reach it directly, carrying invites.full_name, which is text not null
   * default '' and can hold a blank written before names were required. A blank here reaches the
   * auth.users trigger, and the profile it makes is named by the trigger's own last-resort
   * fallback rather than by anybody. Refused, with something the Admin can act on.
   */
  const name = fullName.trim();
  if (!name) {
    return {
      url: null,
      userId: null,
      error:
        "That invitation has no name on it. Revoke it and invite them again with their full name.",
    };
  }
  const invite = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: name } },
  });
  const inviteHash = invite.data?.properties?.hashed_token;
  if (!invite.error && inviteHash) {
    return { url: confirmUrl(inviteHash, "invite"), userId: invite.data.user?.id ?? null };
  }

  /*
   * The name goes on BOTH branches. This one used to pass no metadata at all, and it is not only
   * a resend path: it is where a brand new user lands whenever the invite branch errors, which
   * happens whenever the address was used before. The auth.users trigger reads full_name from
   * this metadata.
   */
  const magic = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: { full_name: name } },
  });
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
  /*
   * A NAME IS NOT OPTIONAL. Checked beside the address rule because four callers reach this
   * function and three of them had no length check, so an Admin or the founder could tab past
   * the name box and create an account called nothing. What that printed varied by screen; on a
   * Reg 73 report it would have printed their email address as the signatory of a submitted
   * regulatory document.
   *
   * generateConfirmUrl below refuses a blank too, and that is the one the resend paths hit. This
   * one exists so somebody filling in a form gets the message written for filling in a form.
   */
  const fullName = p.fullName.trim();
  if (!fullName) {
    return { ok: false, error: "Enter the person's full name. Their name appears on the records and reports they sign." };
  }
  /**
   * Never invite a demo or reserved address.
   *
   * Phil, 2026-07-27: the briefing emails already refuse these, but the INVITE
   * path did not, and that is the one that runs on the first day of a real
   * onboarding — import a spreadsheet with sample rows still in it and we would
   * post dozens of invitations into the void. Bounces at that rate damage the
   * sending domain for every customer, and this happens before anybody is
   * watching the outcome closely. Refused here, at the single door every invite
   * goes through, rather than in each of the four callers.
   */
  if (!isSendableAddress(email)) {
    return {
      ok: false,
      error:
        "That looks like a demo or test address (example.com and similar), so no invitation was sent. Add their real email to invite them.",
    };
  }

  /**
   * The company's own allowlist, checked at the same door and only when the
   * caller opts in (Phil, 2026-07-29, migration 0149).
   *
   * It exists to stop an Admin typing a personal or mistyped address into an
   * account holding staff and Service User records. It deliberately does NOT
   * cover the automatic Team Member invite: "companies wont give work email
   * address out to employee at carer level", so a carer's address is personal
   * by design and enforcing there would lock a company's care workforce out the
   * moment the feature was switched on. That path simply never sets this field.
   *
   * Off unless a domain has been added, so a provider running entirely on gmail
   * or icloud addresses is unaffected. Matching is case insensitive on the part
   * after the @ and includes subdomains.
   */
  const allowedDomains = p.enforceEmailDomains ?? [];
  if (allowedDomains.length > 0 && !isEmailDomainAllowed(email, allowedDomains)) {
    return { ok: false, error: inviteDomainRefusal(allowedDomains) };
  }

  let admin: ServiceClient;
  try {
    admin = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = await createClient();

  const link = await generateConfirmUrl(admin, email, fullName);
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
      full_name: fullName,
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
  const { error: promoteErr } = await admin
    .from("profiles")
    .update({
      company_id: p.companyId,
      role: p.role,
      status: "invited",
      full_name: fullName,
    })
    .eq("id", link.userId);
  // The result used to be discarded, so a refused promotion still sent the email and still
  // reported success: the person got an invitation into a company they had not been added to.
  if (promoteErr) {
    /*
     * The invites row was written a few lines up. Left behind it would sit pending beside a
     * profile with no company, and the resend guard below would then say that person's account
     * does not exist, about an account that does. Take it back out so the Admin can simply try
     * again rather than having to revoke something that never worked.
     */
    await supabase.from("invites").delete().eq("id", invite.id);
    return { ok: false, error: `The invitation could not be recorded: ${promoteErr.message}` };
  }

  if (p.branchId && picksABranch(p.role)) {
    /* The invited branch is the user's primary branch (drives auto-fill). Additional branch
       views are added later from the Users screen.
       A COMPANY ADMIN AND A RESPONSIBLE INDIVIDUAL GET NO ROW (2026-08-19): neither belongs to
       a branch, and writing one made screens claim they did. A REGISTERED MANAGER DOES get one
       (Phil, same day: "may not manage all branches") — CIW registers a manager against a
       service, so their branch is their base. Note the database still treats an RM as company
       wide, so that row is their base, not a limit. */
    await admin
      .from("user_branches")
      .upsert(
        { user_id: link.userId, branch_id: p.branchId, is_primary: true },
        { onConflict: "user_id,branch_id" },
      );
  }

  const hold = p.sendEmail === false;
  const send = hold
    ? { sent: false, skippedReason: undefined as string | undefined, error: undefined as string | undefined }
    : await sendEmail({
        to: email,
        subject: inviteSubject(p.companyName),
        html: inviteEmailHtml({
          companyName: p.companyName,
          inviterName: p.inviter.name || "Your administrator",
          roleLabel: ROLE_LABELS[p.role] ?? p.role,
          actionUrl: link.url,
        }),
      });

  /* Stamp WHEN it went, not merely that it did. A NULL here is what "Not sent yet" is read from
     on Settings > Users, so a failed send must leave it NULL too: an invitation the person never
     received is not a sent invitation, whatever the reason. */
  if (send.sent) {
    await supabase
      .from("invites")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", invite.id);
  }

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
      held: hold,
    },
  });

  return {
    ok: true,
    emailSent: send.sent,
    emailNote: hold
      ? "The email is being held: send it from Settings, Users when you are ready."
      : (send.skippedReason ?? send.error),
  };
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

  /*
   * The invitation must still have an account behind it.
   *
   * Delete an invited user from Settings > Users and their auth user and profile go, but the
   * invites row was left pending. Resending it then found the address free, so generateLink took
   * the "invite" branch and minted a BRAND NEW auth user with no company, no role and status
   * active, who followed the link, sailed past /welcome and bounced off /login?reason=no-access
   * while this screen said "Invite resent." Deleting a user now revokes their pending invites,
   * which removes the cause; this is the check that says so out loud if one is ever orphaned
   * another way.
   */
  const { data: invitee } = await admin
    .from("profiles")
    .select("id, status")
    .eq("email", invite.email)
    .eq("company_id", invite.company_id)
    .maybeSingle();
  if (!invitee) {
    return {
      ok: false,
      error:
        "That person's account no longer exists, so the invitation cannot be resent. Revoke it and invite them again.",
    };
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

  /* This is also the SEND button for a held invite (email_sent_at NULL), so it stamps that
     column when the send succeeds — otherwise a held invite would stay "Not sent yet" for ever
     however many times somebody pressed it. Only on success: a failed send must not tell the
     next reader the person has been written to. */
  await supabase
    .from("invites")
    .update({
      last_sent_at: new Date().toISOString(),
      resend_count: (invite.resend_count ?? 0) + 1,
      ...(send.sent ? { email_sent_at: new Date().toISOString() } : {}),
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

/**
 * Re-send a pending invite by EMAIL, using the service client.
 *
 * resendInvite() above reads the invites table through RLS, which is Company
 * Admin only. A Branch Manager can create a staff invite (policy invites_insert,
 * migration 0131), so they must be able to re-send one too: the caller has
 * already been authorised against the PERSON, and this only ever re-sends to the
 * address already on the invite, never to a new one.
 */
export async function resendStaffInviteByEmail(
  companyId: string,
  email: string,
  actor: Actor,
): Promise<InviteOutcome> {
  let admin: ServiceClient;
  try {
    admin = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const address = email.trim().toLowerCase();
  if (!isSendableAddress(address)) {
    return { ok: false, error: "That is a demo or test address, so nothing was sent." };
  }
  const { data: invite } = await admin
    .from("invites")
    .select("id, full_name, role, status, resend_count")
    .eq("company_id", companyId)
    .eq("email", address)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (!invite) return { ok: false, error: "There is no pending invite for that address." };

  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  // Same orphan check as resendInvite: never mint a fresh account off a stale invitation.
  const { data: invitee } = await admin
    .from("profiles")
    .select("id")
    .eq("email", address)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!invitee) {
    return {
      ok: false,
      error:
        "That person's account no longer exists, so the invitation cannot be resent. Revoke it and invite them again.",
    };
  }

  const link = await generateConfirmUrl(admin, address, invite.full_name as string);
  if (link.error || !link.url) {
    return { ok: false, error: link.error ?? "Could not regenerate the link." };
  }

  const send = await sendEmail({
    to: address,
    subject: inviteSubject((company?.name as string | null) ?? "your company"),
    html: inviteEmailHtml({
      companyName: (company?.name as string | null) ?? "your company",
      inviterName: actor.name || "Your manager",
      roleLabel: ROLE_LABELS[invite.role as string] ?? (invite.role as string),
      actionUrl: link.url,
    }),
  });

  await admin
    .from("invites")
    .update({
      last_sent_at: new Date().toISOString(),
      resend_count: ((invite.resend_count as number | null) ?? 0) + 1,
    })
    .eq("id", invite.id);

  await writeAudit({
    companyId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "invite.resent",
    entityType: "invite",
    entityId: invite.id as string,
    summary: `Resent the Team Member invite to ${address}`,
    metadata: { email: address, email_sent: send.sent },
  });

  return { ok: true, emailSent: send.sent, emailNote: send.skippedReason ?? send.error };
}

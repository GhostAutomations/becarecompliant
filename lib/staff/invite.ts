import "server-only";

/**
 * Be Care Compliant — staff (Team Member) logins.
 *
 * Phil, 2026-07-26: a Team Member gets their login automatically, "when their
 * email is entered on add a person or when the bulk upload is completed". So this
 * is called from createPerson and from the bulk import, never as a separate chore
 * for a Manager to remember.
 *
 * Three things make it safe:
 *  - the role is 'staff', shown as "Team Member". It is NOT the read-only Viewer
 *    role, which reads every Person and every Service User.
 *  - staff logins are FREE: company_active_user_count excludes them (migration
 *    0131), so a 60 carer agency does not appear on the bill as 54 extra seats.
 *  - the login is linked to its Person record straight away (people.profile_id),
 *    which is what lets the existing RLS policies show them their own holidays
 *    and their own submissions, and nothing else.
 *
 * Best effort by design: a failed invite must never stop a Person being created.
 * Every caller reports the outcome rather than throwing.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isSendableAddress } from "@/lib/email/resend";
import {
  createAndSendInvite,
  resendStaffInviteByEmail,
  type Actor,
} from "@/lib/invites";
import { isDemoCompany } from "@/lib/demo/data";
import { writeAudit } from "@/lib/audit";

export type StaffInviteOutcome = {
  ok: boolean;
  emailSent?: boolean;
  /** Why nothing was done: no_email, already_has_login, already_invited. */
  skipped?: string;
  error?: string;
};

/** Give one Person their Team Member login, if they have an email and no login yet. */
export async function inviteStaffForPerson(
  personId: string,
  inviter: Actor,
  /** Pass false to create the login without emailing them yet: the invite waits on
   *  Settings > Users as "Not sent yet" until somebody presses Send invite. */
  opts?: { sendEmail?: boolean },
): Promise<StaffInviteOutcome> {
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, branch_id, full_name, work_email, profile_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "That person could not be found." };
  // No logins from inside a demo (0356): the Person is added, nobody is invited.
  if (await isDemoCompany(person.company_id as string)) return { ok: false, skipped: "demo" };

  const email = String(person.work_email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, skipped: "no_email" };
  // A seeded or sample address is not a failure to report to a Manager, it is a
  // row we deliberately leave alone (Phil, 2026-07-27).
  if (!isSendableAddress(email)) return { ok: false, skipped: "demo_email" };
  if (person.profile_id) return { ok: true, skipped: "already_has_login" };

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", person.company_id)
    .maybeSingle();

  const outcome = await createAndSendInvite({
    companyId: person.company_id as string,
    companyName: (company?.name as string | null) ?? "your company",
    branchId: (person.branch_id as string | null) ?? null,
    email,
    fullName: person.full_name as string,
    role: "staff",
    inviter,
    sendEmail: opts?.sendEmail !== false,
  });

  // An invite already waiting is not a failure: someone was added twice, or the
  // email was corrected and re-entered. Link the record and move on.
  const alreadyInvited =
    !outcome.ok && /already a pending invite/i.test(outcome.error ?? "");
  if (!outcome.ok && !alreadyInvited) {
    return { ok: false, error: outcome.error };
  }

  await linkPersonToLogin(person.id as string, person.company_id as string, email);

  return alreadyInvited
    ? { ok: true, skipped: "already_invited" }
    : { ok: true, emailSent: outcome.ok ? outcome.emailSent : false };
}

/**
 * Point the Person record at its login. Done with the service client because the
 * profile row belongs to the invited user, not the caller, and because this must
 * work for a Branch Manager adding a carer as well as for an Admin.
 */
async function linkPersonToLogin(
  personId: string,
  companyId: string,
  email: string,
): Promise<void> {
  try {
    const admin = createServiceClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .eq("company_id", companyId)
      .maybeSingle();
    if (profile?.id) {
      await admin.from("people").update({ profile_id: profile.id }).eq("id", personId);
    }
  } catch (e) {
    // The link is a convenience, not a gate: their holidays simply will not show
    // on their own record until it is set. Never break the caller.
    console.error("[staff] could not link person to login:", (e as Error).message);
  }
}

/**
 * Invite this Person, or re-send the invite they never opened. Used by the button
 * on the Person record, for the people who were added before staff logins
 * existed, or imported without an email, or who lost the email.
 */
export async function inviteOrResendForPerson(
  personId: string,
  inviter: Actor,
): Promise<StaffInviteOutcome> {
  const first = await inviteStaffForPerson(personId, inviter);
  /* A LOGIN THAT WAS NEVER ACCEPTED IS NOT "ALREADY HAS A LOGIN" (Phil, 2026-09-29: pressed Send
     invite on Vera's record and nothing went). The import creates the login and links it to the
     Person with the email held, so the record is linked, the first step says already_has_login,
     and this used to stop there and report "They already have a login". Both answers now go on
     to send the waiting invite; only when there is no pending invite (the login is really in
     use) does the original answer stand. */
  if (first.skipped !== "already_invited" && first.skipped !== "already_has_login") return first;

  // An invite is already waiting: send it again rather than doing nothing.
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("company_id, work_email")
    .eq("id", personId)
    .maybeSingle();
  if (!person?.work_email) return { ok: false, skipped: "no_email" };

  const resent = await resendStaffInviteByEmail(
    person.company_id as string,
    person.work_email as string,
    inviter,
  );
  if (!resent.ok && first.skipped === "already_has_login" && /no pending invite/i.test(resent.error ?? "")) {
    return first;
  }
  return resent.ok
    ? { ok: true, emailSent: resent.emailSent }
    : { ok: false, error: resent.error };
}

export type EmailFollowOutcome =
  | { moved: true }
  | { moved: false; reason: "no_login" | "login_in_use" | "same" | "not_sendable" | "taken" | "error"; error?: string };

/**
 * THE INVITE FOLLOWS A CORRECTED EMAIL (Phil, 2026-10-05: Lauren Morgan's personal email was
 * spelt wrong; it was corrected on her record and Send still went to the old address). A login
 * made from a Person record carries its own copy of the address (the auth user, the profile and
 * the pending invite), so correcting the record alone left all three on the misspelling, and Send
 * then found no invite at the new address and sent nothing at all.
 *
 * Moved only while the login has NEVER BEEN USED (profile still "invited"): nobody has signed in
 * with the old address, so nothing of theirs depends on it. A login somebody already signs in
 * with is theirs, and is not changed from a field on a record.
 *
 * One account per email (DEF-009): refused when the new address already belongs to another login.
 */
export async function followPersonEmailChange(
  personId: string,
  newEmailRaw: string | null,
  actor: Actor,
): Promise<EmailFollowOutcome> {
  try {
    const admin = createServiceClient();
    const newEmail = String(newEmailRaw ?? "").trim().toLowerCase();
    const { data: person } = await admin
      .from("people")
      .select("company_id, profile_id")
      .eq("id", personId)
      .maybeSingle();
    if (!person?.profile_id) return { moved: false, reason: "no_login" };
    const { data: login } = await admin
      .from("profiles")
      .select("id, email, status, company_id")
      .eq("id", person.profile_id)
      .maybeSingle();
    if (!login) return { moved: false, reason: "no_login" };
    if (login.status !== "invited") return { moved: false, reason: "login_in_use" };
    const oldEmail = String(login.email ?? "").trim().toLowerCase();
    if (!newEmail || newEmail === oldEmail) return { moved: false, reason: "same" };
    if (!isSendableAddress(newEmail)) return { moved: false, reason: "not_sendable" };

    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .eq("email", newEmail)
      .neq("id", login.id)
      .limit(1);
    if (clash && clash.length > 0) return { moved: false, reason: "taken" };

    const { error: authErr } = await admin.auth.admin.updateUserById(login.id as string, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) return { moved: false, reason: "error", error: authErr.message };
    await admin.from("profiles").update({ email: newEmail }).eq("id", login.id);
    await admin
      .from("invites")
      .update({ email: newEmail })
      .eq("company_id", person.company_id)
      .eq("status", "pending")
      .eq("email", oldEmail);
    await writeAudit({
      companyId: person.company_id as string,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "invite.email_corrected",
      entityType: "invite",
      entityId: login.id as string,
      summary: `Moved an unused login from ${oldEmail} to ${newEmail}`,
      metadata: { person_id: personId, from: oldEmail, to: newEmail },
    });
    return { moved: true };
  } catch (e) {
    return { moved: false, reason: "error", error: (e as Error).message };
  }
}

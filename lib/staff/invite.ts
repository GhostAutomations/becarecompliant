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
import { createAndSendInvite, type Actor } from "@/lib/invites";

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
): Promise<StaffInviteOutcome> {
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, branch_id, full_name, work_email, profile_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, error: "That person could not be found." };

  const email = String(person.work_email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, skipped: "no_email" };
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

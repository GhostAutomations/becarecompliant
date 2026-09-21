"use server";

/**
 * Be Care Compliant — the Team Member login button on a Person record.
 *
 * Most logins go out automatically when a Person is added or imported with an
 * email. This is for the rest: people who were on the register before staff
 * logins existed, someone whose email was added later, or an invite that never
 * got opened.
 *
 * Authorisation is on the PERSON, not the profile: person_login_status and the
 * invite policies already require platform admin, a company-wide role, or the
 * Branch Manager of that person's branch.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { inviteOrResendForPerson } from "@/lib/staff/invite";
import { REGISTER_ROLES } from "@/lib/auth/module-roles";

/*
 * WHOEVER MAY ADD THE CARER MAY GIVE THEM THEIR LOGIN (2026-09-21, with 0316).
 *
 * This was a Manager-and-above list of its own while the People register moved to Supervisors
 * and Recruiters (0309, 0311). Adding a person with an email creates their login as part of the
 * add, so a Supervisor was already doing this every time — she simply could not press the button
 * when it did not work first time. One list, the register's, so the two cannot drift apart
 * again; the policy underneath asks the same question (is_branch_lead).
 *
 * This is a CARER'S OWN AREA, not an invitation to run the service. Inviting a Manager or a
 * Supervisor is still Settings, still Company Admins only.
 */
const CAN_INVITE_A_CARER = REGISTER_ROLES;

export async function invitePersonLogin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!CAN_INVITE_A_CARER.includes(profile.role)) {
    return { error: "You do not have permission to give this person a login." };
  }
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("id, full_name, work_email")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That person could not be found." };
  if (!person.work_email) {
    return { error: "Add their personal email to the record first, then invite them." };
  }

  const outcome = await inviteOrResendForPerson(personId, {
    id: user.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
  });

  if (!outcome.ok) {
    /* A REFUSAL IS NOT A FAILURE, AND IT SHOULD SAY WHICH (Phil, 2026-09-09: clicked Invite
       them on a record with a sample address and got "The invite could not be sent"). The
       invite pipeline knows exactly why it stopped and hands the reason back in `skipped`;
       this fell straight through to a sentence that names no cause and offers no fix, which
       is the same sentence somebody would get for a dead mailbox or a broken API key. */
    if (outcome.skipped === "demo_email") {
      return {
        error:
          `${person.work_email} is a sample address, so nothing was sent. Put their real email on the record and invite them again.`,
      };
    }
    if (outcome.skipped === "no_email") {
      return { error: "Add their personal email to the record first, then invite them." };
    }
    return {
      error:
        outcome.error ??
        `The invite could not be sent${outcome.skipped ? ` (${outcome.skipped})` : ""}. Please try again, and tell support if it keeps happening.`,
    };
  }
  if (outcome.skipped === "already_has_login") {
    return { ok: "They already have a login." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "staff_login.invited",
    entityType: "person",
    entityId: personId,
    summary: `Sent a Team Member login invite to ${person.full_name}`,
    metadata: { email_sent: outcome.emailSent ?? false },
  });

  revalidatePath(`/people/${personId}`);
  return {
    ok: outcome.emailSent
      ? "Invite sent."
      : "Invite created, but the email could not be sent.",
  };
}

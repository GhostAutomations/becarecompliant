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

const MANAGER_PLUS = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

export async function invitePersonLogin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGER_PLUS.includes(profile.role)) {
    return { error: "Only a Manager or an Admin can send a login invite." };
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
    return { error: outcome.error ?? "The invite could not be sent." };
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

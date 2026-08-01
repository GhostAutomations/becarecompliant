import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Be Care Compliant - the SMS opt out list.
 *
 * One rule: a number that has texted STOP is never texted again until it texts START. The check
 * runs in sendSms BEFORE a credit is claimed, so an opted out recipient costs the customer
 * nothing as well as receiving nothing.
 *
 * WHY THE NUMBER AND NOT THE PERSON. The obligation is attached to the handset. A number that
 * matches no profile still has to be obeyed, and the block has to survive the person leaving,
 * their profile being archived, or the number being typed against a different member of staff.
 *
 * Service role throughout: the only writer is the Twilio webhook, which has no session, and
 * sms_opt_outs deliberately has no insert, update or delete policy. A Company Admin can SEE that
 * somebody has opted out and cannot undo it on their behalf.
 */

export const SMS_OPTED_OUT =
  "That number has replied STOP to our texts, so nothing was sent. They can reply START to turn them back on.";

/**
 * Has this number opted out?
 *
 * `null` means WE COULD NOT TELL, which is a different thing from "no" and must never be
 * reported to a caller as one. Same shape as spendSmsCredit, and for the same reason: silently
 * treating a database outage as permission to text somebody is exactly the failure this list
 * exists to prevent.
 */
export async function isOptedOut(phone: string): Promise<boolean | null> {
  const { data, error } = await createServiceClient()
    .from("sms_opt_outs")
    .select("phone")
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("[sms-opt-out] lookup failed:", error.message);
    return null;
  }
  return data !== null;
}

/** Add a number to the list. Idempotent: a second STOP from the same handset is not an error. */
export async function recordOptOut(opts: {
  phone: string;
  companyId: string | null;
  profileId: string | null;
}): Promise<{ ok: boolean; detail?: string }> {
  /*
   * The attribution columns are only SENT when we have them.
   *
   * PostgREST's upsert updates exactly the columns in the payload, so omitting them leaves
   * whatever is already on the row alone. That matters: a number can be opted out before anyone
   * has typed it against a person, later claimed for a company when an admin saves it, and then
   * text STOP again from the same handset. Sending nulls on that second STOP would wipe the
   * attribution and make the warning disappear from that company's Notifications page.
   */
  const row: Record<string, unknown> = {
    phone: opts.phone,
    opted_out_at: new Date().toISOString(),
    source: "sms_stop",
  };
  if (opts.companyId) row.company_id = opts.companyId;
  if (opts.profileId) row.profile_id = opts.profileId;

  const { error } = await createServiceClient()
    .from("sms_opt_outs")
    .upsert(row, { onConflict: "phone" });
  if (error) {
    console.error("[sms-opt-out] record failed:", error.message);
    return { ok: false, detail: error.message };
  }
  return { ok: true };
}

/** Take a number off the list, after START. Deleting an absent row is a success, not an error. */
export async function clearOptOut(phone: string): Promise<{ ok: boolean; detail?: string }> {
  const { error } = await createServiceClient().from("sms_opt_outs").delete().eq("phone", phone);
  if (error) {
    console.error("[sms-opt-out] clear failed:", error.message);
    return { ok: false, detail: error.message };
  }
  return { ok: true };
}

import "server-only";

/**
 * Be Care Compliant — what happens when a leaving takes effect (DEF-058).
 *
 * ONE PLACE, TWO CALLERS. A leaving date already gone takes effect the moment it is saved
 * (setEmploymentStatus); today or a future date takes effect in the nightly run after the day
 * ends (applyDueLeavings, from the retention cron). Both must do exactly the same three things,
 * so they both call applyLeaving:
 *
 *   1. the Person becomes a leaver, dated the day they actually left, which is what starts the
 *      eight year retention clock;
 *   2. their login closes: any waiting invite revoked, the account disabled, every signed in
 *      device dropped at its next page (Phil, 2026-09-23: Mohammad's invite had to be revoked
 *      by hand, and a leaver who can still sign in can still read the portal);
 *   3. the leaving row is stamped applied.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { applyRetentionForRecord } from "@/lib/evidence/retention";
import { writeAudit } from "@/lib/audit";
import { todayIso } from "./logic";

type Db = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>;

export type LoginClosed =
  | { closed: true; email: string }
  | { closed: false; reason: "no_login" | "already_closed" | "is_admin" | "error"; note?: string };

/**
 * Close a Person's login. An ADMIN'S is left alone on purpose and said so: a company whose only
 * Admin is marked as leaving by mistake must not lock itself out, and closing an Admin account
 * is a decision for Settings, taken knowingly.
 */
export async function closePersonLogin(personId: string, companyId: string): Promise<LoginClosed> {
  try {
    const admin = createServiceClient();
    const { data: person } = await admin
      .from("people")
      .select("profile_id, work_email")
      .eq("id", personId)
      .maybeSingle<{ profile_id: string | null; work_email: string | null }>();
    const { data: profile } = person?.profile_id
      ? await admin
          .from("profiles")
          .select("id, email, status, role")
          .eq("id", person.profile_id)
          .maybeSingle<{ id: string; email: string; status: string; role: string }>()
      : { data: null };

    // A waiting invite is revoked whether or not the profile link was ever made.
    const emails = [profile?.email, person?.work_email]
      .map((e) => String(e ?? "").trim().toLowerCase())
      .filter((e, i, all) => e && all.indexOf(e) === i);
    for (const email of emails) {
      await admin
        .from("invites")
        .update({ status: "revoked" })
        .eq("company_id", companyId)
        .eq("email", email)
        .eq("status", "pending");
    }

    if (!profile) return { closed: false, reason: "no_login" };
    if (profile.role === "company_admin") return { closed: false, reason: "is_admin" };
    if (profile.status === "disabled") return { closed: false, reason: "already_closed" };

    const { error } = await admin.from("profiles").update({ status: "disabled" }).eq("id", profile.id);
    if (error) return { closed: false, reason: "error", note: error.message };
    // Every device they are signed in on is dropped at its next page (see lib/auth/guards.ts).
    await admin.from("user_sessions").delete().eq("user_id", profile.id);
    return { closed: true, email: profile.email };
  } catch (e) {
    return { closed: false, reason: "error", note: (e as Error).message };
  }
}

/** Make the Person a leaver now, dated the day they left, and close their login. */
export async function applyLeaving(input: {
  db: Db;
  leavingId: string;
  personId: string;
  companyId: string;
  leavingDate: string;
}): Promise<{ error?: string; retentionError?: string; login: LoginClosed }> {
  const { data, error } = await input.db
    .from("people")
    .update({ employment_status: "leaver", leaver_date: input.leavingDate, archived_at: null })
    .eq("id", input.personId)
    .select("id");
  if (error) return { error: error.message, login: { closed: false, reason: "error" } };
  if (!data || data.length === 0) {
    return { error: "No change was saved. You may not have permission.", login: { closed: false, reason: "error" } };
  }

  const retention = await applyRetentionForRecord({
    companyId: input.companyId,
    recordType: "person",
    recordId: input.personId,
    endOfCare: input.leavingDate,
  });
  const login = await closePersonLogin(input.personId, input.companyId);
  await createServiceClient()
    .from("person_leavings")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", input.leavingId);
  return { retentionError: retention.error, login };
}

/**
 * The nightly half: every planned leaving whose day has now ENDED. They stayed active until
 * 23:59 of their leaving date (Phil, 2026-09-23), so a date before today is due.
 */
export async function applyDueLeavings(): Promise<{ applied: number; errors: string[] }> {
  const admin = createServiceClient();
  const today = todayIso();
  const { data, error } = await admin
    .from("person_leavings")
    .select("id, person_id, company_id, leaving_date")
    .is("applied_at", null)
    .is("cancelled_at", null)
    .lt("leaving_date", today)
    .limit(200);
  if (error) return { applied: 0, errors: [error.message] };

  const errors: string[] = [];
  let applied = 0;
  for (const row of (data as Array<{ id: string; person_id: string; company_id: string; leaving_date: string }>) ?? []) {
    const result = await applyLeaving({
      db: admin,
      leavingId: row.id,
      personId: row.person_id,
      companyId: row.company_id,
      leavingDate: row.leaving_date,
    });
    if (result.error) {
      errors.push(`${row.person_id}: ${result.error}`);
      continue;
    }
    applied += 1;
    await writeAudit({
      companyId: row.company_id,
      actorId: null,
      actorEmail: null,
      actorRole: "nightly",
      action: "person.left",
      entityType: "person",
      entityId: row.person_id,
      summary: `Became a leaver at the end of ${row.leaving_date}, as planned${
        result.login.closed ? "; login closed" : ""
      }`,
      metadata: {
        leaving_id: row.id,
        leaving_date: row.leaving_date,
        login: result.login,
        ...(result.retentionError ? { retention_error: result.retentionError } : {}),
      },
    });
  }
  return { applied, errors };
}

"use server";

/**
 * Be Care Compliant — Training write actions (Admins and branch Managers only;
 * RLS enforces it again at the row). Records or clears a person's course result,
 * with an optional certificate upload to the private bucket. No dashes in copy.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { deriveRenewalDate } from "@/lib/training/renewal";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { uploadTrainingCertificate, deleteTrainingCertificate } from "@/lib/training/storage";
import type { ActionState } from "@/lib/forms";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveTraining(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    return { error: "Only Admins and Managers can record training." };
  }

  const personId = String(formData.get("person_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  if (!personId || !courseId) return { error: "Missing person or course." };

  const supabase = await createClient();

  // Resolve the person through RLS: a manager who cannot see this person (wrong
  // branch) gets no row back, which authorises the write by branch, not just company.
  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, branch_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person || person.company_id !== profile.company_id) {
    return { error: "That person is not in your view." };
  }

  // Confirm the course belongs to this company, and read the renewal it is configured with.
  const { data: course } = await supabase
    .from("training_courses")
    .select("id, name, renewal_months")
    .eq("id", courseId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!course) return { error: "Unknown course." };

  if (intent === "clear") {
    /*
     * SELECT WHAT WAS DELETED, and refuse to report success when nothing was.
     *
     * Caught by review: a delete that RLS quietly matched nothing still flashed a green
     * "Cleared", and the record was still there after a refresh. The certificate goes too, which
     * is what the confirmation promises; it was previously left orphaned in the bucket for ever.
     */
    const { data: gone, error } = await supabase
      .from("person_training")
      .delete()
      .eq("person_id", personId)
      .eq("course_id", courseId)
      .select("id, certificate_path");
    if (error) return { error: error.message };
    if (!gone || gone.length === 0) {
      return { error: "That training record could not be cleared. It may already be gone, or it may sit outside your branches." };
    }
    for (const row of gone) {
      if (row.certificate_path) await deleteTrainingCertificate(row.certificate_path as string);
    }
    await writeAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "training.cleared",
      entityType: "training",
      entityId: personId,
      summary: `Cleared ${course.name} training`,
      metadata: { course_id: courseId },
    });
    revalidatePath("/people/training");
    return { ok: "Training cleared." };
  }

  const completedRaw = String(formData.get("completed_on") ?? "").trim();
  const expiryRaw = String(formData.get("expiry_on") ?? "").trim();
  const completed = ISO_RE.test(completedRaw) ? completedRaw : null;
  const typedExpiry = ISO_RE.test(expiryRaw) ? expiryRaw : null;
  if (!completed && !typedExpiry) {
    return { error: "Enter a completed date or a renewal date, or use Clear." };
  }

  /*
   * THE RENEWAL DATE IS WORKED OUT WHEN IT IS BLANK (Phil, 2026-08-01).
   *
   * The dialog follows the course rule as you pick a completion date; this is the same sum, done
   * again here, so a form that submits nothing in that field still stores the right date.
   *
   * A DATE THAT ARRIVES IS TAKEN AS GIVEN, deliberately. Courses get re-accredited early and a
   * certificate that says a different date than the rule IS the date. The server therefore does
   * not police this field, and saying otherwise would be worse than saying nothing: it is an
   * override, and an override that can be overridden is not one.
   */
  const expiry =
    typedExpiry ?? (completed ? deriveRenewalDate(completed, course.renewal_months as number | null) : null);

  const { data: up, error } = await supabase
    .from("person_training")
    .upsert(
      {
        company_id: person.company_id,
        branch_id: person.branch_id,
        person_id: personId,
        course_id: courseId,
        status: "completed",
        completed_on: completed,
        expiry_on: expiry,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "person_id,course_id" },
    )
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };

  // Optional certificate upload.
  const file = formData.get("certificate");
  if (up && file && typeof file !== "string" && file.size > 0) {
    const res = await uploadTrainingCertificate(person.company_id, up.id, file);
    if (!res.ok) return { error: res.error };
    await supabase.from("person_training").update({ certificate_path: res.path }).eq("id", up.id);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "training.updated",
    entityType: "training",
    entityId: personId,
    summary: `Recorded ${course.name} training`,
    metadata: { course_id: courseId, completed_on: completed, expiry_on: expiry },
  });
  revalidatePath("/people/training");
  return { ok: "Training saved." };
}

/**
 * Record ONE course for MANY people, on one date.
 *
 * WHY (Phil, 2026-08-01). A care team does Moving and Handling together on a Tuesday morning.
 * Recording that was one dialog per carer, twenty times, each with two dates typed by hand. This
 * is the same save the cell dialog does, run across a list.
 *
 * EVERY PERSON IS RESOLVED THROUGH RLS FIRST, so a branch Manager ticking a list can only ever
 * write to people she can already see, and the branch written on each row is read back from the
 * register rather than taken from the browser. Anyone outside her reach is dropped rather than
 * refused, and the count she gets back is what was actually written.
 *
 * ONE audit row, not twenty. This is one action a person took.
 */
export async function saveTrainingBulk(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"].includes(profile.role)) {
    return { error: "Only Admins and Managers can record training." };
  }

  const courseId = String(formData.get("course_id") ?? "");
  if (!courseId) return { error: "Choose a course." };

  const completedRaw = String(formData.get("completed_on") ?? "").trim();
  if (!ISO_RE.test(completedRaw)) return { error: "Choose the date the training was completed." };
  const completed = completedRaw;

  const personIds = formData.getAll("person_ids").map((v) => String(v)).filter(Boolean);
  if (personIds.length === 0) return { error: "Tick at least one carer." };

  const supabase = await createClient();

  const { data: course } = await supabase
    .from("training_courses")
    .select("id, name, renewal_months")
    .eq("id", courseId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!course) return { error: "Unknown course." };

  /*
   * RLS decides the reach, and the ids are read back from the DATABASE, never trusted from the
   * browser: company_id and branch_id on each written row come from the register, so a manager
   * cannot spoof a branch even by editing the request.
   *
   * CHUNKED at 200. These ids become a GET query string, and "select these" across a 300 carer
   * company would otherwise build a URL measured in kilobytes. The same reason lib/training/
   * data.ts chunks its reads.
   *
   * Leavers and archived people are excluded here as they are everywhere else: recording
   * training against somebody who left is not a thing anyone means to do.
   */
  const IDS_PER_REQUEST = 200;
  const reachable: Array<{ id: string; company_id: string; branch_id: string | null }> = [];
  for (let i = 0; i < personIds.length; i += IDS_PER_REQUEST) {
    const chunk = personIds.slice(i, i + IDS_PER_REQUEST);
    const { data, error: peopleError } = await supabase
      .from("people")
      .select("id, company_id, branch_id")
      .in("id", chunk)
      .eq("company_id", profile.company_id)
      .is("archived_at", null)
      .neq("employment_status", "leaver");
    if (peopleError) return { error: `The register could not be read: ${peopleError.message}` };
    reachable.push(...((data ?? []) as typeof reachable));
  }
  if (reachable.length === 0) return { error: "None of those carers are in your view." };

  const expiry = deriveRenewalDate(completed, course.renewal_months as number | null);
  const now = new Date().toISOString();
  const rows = reachable.map((p) => ({
    company_id: p.company_id,
    branch_id: p.branch_id,
    person_id: p.id,
    course_id: courseId,
    status: "completed",
    completed_on: completed,
    expiry_on: expiry,
    updated_by: profile.id,
    updated_at: now,
  }));

  /*
   * ONE STATEMENT FIRST, then one at a time if the database refuses.
   *
   * Caught by review: reading people through people_select is WIDER than writing through
   * person_training_write. A manager who also supervises somebody in another branch would find
   * that person in the list, and a single upsert containing one row RLS refuses rolls back all
   * twenty, showing her a raw policy error and recording nothing. The retry salvages every row
   * she is actually allowed to write and reports the true count, which is what the message below
   * has always claimed to do.
   */
  let written = 0;
  const { error } = await supabase.from("person_training").upsert(rows, { onConflict: "person_id,course_id" });
  if (!error) {
    written = rows.length;
  } else {
    for (const row of rows) {
      const { error: rowError } = await supabase
        .from("person_training")
        .upsert(row, { onConflict: "person_id,course_id" });
      if (!rowError) written += 1;
    }
    if (written === 0) return { error: `Nothing could be recorded: ${error.message}` };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "training.recorded_in_bulk",
    // The subject of a bulk record is the COURSE, not one person, so the id says so.
    entityType: "training_course",
    entityId: courseId,
    summary: `Recorded ${course.name} for ${written} ${written === 1 ? "person" : "people"}`,
    metadata: { course_id: courseId, completed_on: completed, expiry_on: expiry, count: written },
  });

  revalidatePath("/people/training");
  const skipped = personIds.length - written;
  return {
    ok:
      skipped > 0
        ? `Recorded for ${written}. ${skipped} could not be, so they were left alone.`
        : `Recorded for ${written} ${written === 1 ? "carer" : "carers"}.`,
  };
}

/** Create or update a training course in the company catalogue. Admins only. */
export async function saveCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!["platform_admin", "company_admin"].includes(profile.role)) {
    return { error: "Only Admins can change training courses." };
  }
  const companyId = profile.company_id;

  const courseId = String(formData.get("course_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the course a name." };

  const renewalRaw = String(formData.get("renewal_months") ?? "").trim();
  let renewal: number | null = null;
  if (renewalRaw !== "") {
    const n = Number.parseInt(renewalRaw, 10);
    if (!Number.isInteger(n) || n < 1) return { error: "Renewal months must be a whole number, or blank for one off." };
    renewal = n;
  }
  const amberRaw = String(formData.get("amber_days") ?? "").trim();
  const amber = amberRaw === "" ? 30 : Number.parseInt(amberRaw, 10);
  if (!Number.isInteger(amber) || amber < 0) return { error: "Amber days must be zero or more." };

  const patch = {
    name,
    renewal_months: renewal,
    mandatory: String(formData.get("mandatory") ?? "") === "on",
    is_safeguarding: String(formData.get("is_safeguarding") ?? "") === "on",
    amber_days: amber,
    active: String(formData.get("active") ?? "") === "on",
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  if (courseId) {
    const { error } = await supabase
      .from("training_courses")
      .update(patch)
      .eq("id", courseId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase
      .from("training_courses")
      .select("sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort = (last?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from("training_courses")
      .insert({ company_id: companyId, sort_order: sort, ...patch });
    if (error) return { error: error.message };
  }

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: courseId ? "training.course_updated" : "training.course_created",
    entityType: "training",
    entityId: courseId || null,
    summary: `${courseId ? "Updated" : "Added"} training course ${name}`,
    metadata: { renewal_months: renewal },
  });
  revalidatePath("/settings/people");
  revalidatePath("/people/training");
  return { ok: "Course saved." };
}

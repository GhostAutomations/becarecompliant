"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";
import { ukDate } from "@/lib/dates";
import { normaliseStartTime } from "@/lib/planner/booking-time";
import { bookingsOverlap, clashMessage, displayTime } from "@/lib/planner/overlap";

function revalidatePlanner() {
  revalidatePath("/planner");
  revalidatePath("/planner/whiteboard");
}

/** Remember the user's My Planner view choice (month or week) so the Planner opens on whatever
 *  they were last looking at. Migration 0187 renamed 'calendar' to 'month'; the list view was
 *  scrapped on 2026-08-15 and 'list' is treated as 'month' on the way in. */
export async function setPlannerView(view: "month" | "week"): Promise<void> {
  await requireCompany();
  // Checked here as well as in the RPC: the RPC raises, and a raise from a view toggle would put
  // an error on the screen for something nobody can see the consequence of.
  if (view !== "month" && view !== "week") return;
  const supabase = await createClient();
  await supabase.rpc("set_planner_view", { v: view });
  revalidatePath("/planner");
}

/** Book a task: either against one of a record's checks, or ad-hoc. Lands on the
 *  chosen conductor's planner and the branch whiteboard. */
type ClashSubject = {
  conductorId: string;
  personId: string | null;
  serviceUserId: string | null;
};

/**
 * The sentence somebody reads instead of a database error.
 *
 * Migration 0180 makes a double booking impossible with three exclusion constraints, which
 * is the guarantee. This is the manners: it names WHO is already busy and WHEN, so the
 * person booking can move it rather than being told "exclusion_violation".
 *
 * All three dimensions, because Phil's follow up was the important half: a conductor-only
 * rule still lets a second manager book the same carer at the same moment.
 */
async function findClash(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  scheduledDate: string,
  startTime: string | null,
  durationMinutes: number,
  subject: ClashSubject,
  ignoreBookingId?: string,
): Promise<string | null> {
  // An untimed booking occupies no window, so it cannot clash. Same rule as the constraints.
  if (!startTime) return null;

  const { data } = await supabase
    .from("planner_bookings")
    .select(
      "id, start_time, duration_minutes, check_kind, title, conductor_profile_id, subject_person_id, subject_service_user_id",
    )
    .eq("company_id", companyId)
    .eq("scheduled_date", scheduledDate)
    .neq("status", "cancelled")
    .not("start_time", "is", null);

  const rows = (data as Array<{
    id: string;
    start_time: string | null;
    duration_minutes: number | null;
    check_kind: string | null;
    title: string | null;
    conductor_profile_id: string | null;
    subject_person_id: string | null;
    subject_service_user_id: string | null;
  }> | null) ?? [];

  for (const row of rows) {
    if (ignoreBookingId && row.id === ignoreBookingId) continue;
    if (
      !bookingsOverlap(
        { startTime, durationMinutes },
        { startTime: row.start_time, durationMinutes: row.duration_minutes },
      )
    ) {
      continue;
    }

    const what = row.check_kind || row.title || "another task";
    const when = displayTime(row.start_time);

    // Conductor first: it is the commonest clash and the easiest to act on.
    if (row.conductor_profile_id && row.conductor_profile_id === subject.conductorId) {
      const { data: who } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", subject.conductorId)
        .maybeSingle();
      const name = (who?.full_name as string | null) || "That person";
      return clashMessage({ name, what, when, bookedByAnother: false });
    }

    if (subject.personId && row.subject_person_id === subject.personId) {
      const { data: who } = await supabase
        .from("people")
        .select("full_name")
        .eq("id", subject.personId)
        .maybeSingle();
      const name = (who?.full_name as string | null) || "That person";
      return clashMessage({ name, what, when, bookedByAnother: true });
    }

    if (subject.serviceUserId && row.subject_service_user_id === subject.serviceUserId) {
      const { data: who } = await supabase
        .from("service_users")
        .select("full_name")
        .eq("id", subject.serviceUserId)
        .maybeSingle();
      const name = (who?.full_name as string | null) || "That service user";
      return clashMessage({ name, what, when, bookedByAnother: true });
    }
  }

  return null;
}

export async function createBooking(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const gate = await requireFeature(profile.company_id, "planner");
  if (gate) return { error: gate };
  const companyId = profile.company_id;
  const supabase = await createClient();

  const subjectKind = String(formData.get("subject_kind") ?? "").trim(); // person | service_user | adhoc
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const checkInstanceId = String(formData.get("check_instance_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const conductorId = String(formData.get("conductor_id") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  /* VALIDATED SERVER SIDE, not just in the dropdown. The picker has always offered a
     sensible grid and this action used to write whatever it was posted, which is how
     "01:54 Care Plan Review" reached the dashboard. */
  const startTimeResult = normaliseStartTime(formData.get("start_time"));
  if (!startTimeResult.ok) return { error: startTimeResult.error };
  const startTime = startTimeResult.value;
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  let branchId = String(formData.get("branch_id") ?? "").trim();

  if (!conductorId) return { error: "Choose who will carry out the task." };
  if (!scheduledDate) return { error: "Choose a date." };

  let population: "people" | "service_users" | null = null;
  let subjectPersonId: string | null = null;
  let subjectServiceUserId: string | null = null;
  let checkKind: string | null = null;

  if (subjectKind === "person" || subjectKind === "service_user") {
    if (!subjectId) return { error: "Choose who the task is for." };
    const table = subjectKind === "person" ? "people" : "service_users";
    const { data: subj } = await supabase
      .from(table)
      .select("id, branch_id, company_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!subj || subj.company_id !== companyId) return { error: "That record was not found." };
    branchId = (subj.branch_id as string | null) ?? "";
    if (!branchId) return { error: "That record has no branch set." };
    if (subjectKind === "person") {
      population = "people";
      subjectPersonId = subjectId;
    } else {
      population = "service_users";
      subjectServiceUserId = subjectId;
    }

    if (checkInstanceId) {
      const { data: inst } = await supabase
        .from("check_instances")
        .select("id, company_id, person_id, service_user_id, check_definitions(name)")
        .eq("id", checkInstanceId)
        .maybeSingle();
      if (!inst || inst.company_id !== companyId) return { error: "That check was not found." };
      const belongs =
        (subjectKind === "person" && inst.person_id === subjectId) ||
        (subjectKind === "service_user" && inst.service_user_id === subjectId);
      if (!belongs) return { error: "That check does not belong to this record." };
      const defRaw = (inst as unknown as {
        check_definitions: { name: string }[] | { name: string } | null;
      }).check_definitions;
      const def = Array.isArray(defRaw) ? defRaw[0] ?? null : defRaw;
      checkKind = def?.name ?? null;
    }
  } else {
    // Ad-hoc: needs a title and an explicit branch.
    if (!title) return { error: "Enter a title for the task." };
    if (!branchId) return { error: "Choose a branch." };
    const { data: br } = await supabase
      .from("branches")
      .select("id, company_id")
      .eq("id", branchId)
      .maybeSingle();
    if (!br || br.company_id !== companyId) return { error: "That branch was not found." };
  }

  // Duration defaults to 30 minutes when left blank.
  const duration = durationRaw ? Math.max(5, Number(durationRaw) || 30) : 30;

  /* Nobody is in two places at once, and nobody is visited twice at once. The database
     refuses this outright (0180); this is so the person booking gets a sentence naming who
     is already busy instead of a constraint error. */
  const clash = await findClash(supabase, companyId, scheduledDate, startTime, duration, {
    conductorId,
    personId: subjectPersonId,
    serviceUserId: subjectServiceUserId,
  });
  if (clash) return { error: clash };

  const { data: inserted, error } = await supabase
    .from("planner_bookings")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      population,
      subject_person_id: subjectPersonId,
      subject_service_user_id: subjectServiceUserId,
      check_instance_id: checkInstanceId || null,
      check_kind: checkKind,
      title: title || null,
      conductor_profile_id: conductorId,
      scheduled_date: scheduledDate,
      start_time: startTime,
      duration_minutes: duration,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "planner.booking_created",
    entityType: "planner_booking",
    entityId: inserted.id,
    summary: `Booked ${checkKind || title || "a task"} for ${ukDate(scheduledDate)}`,
  });

  revalidatePlanner();
  if (subjectPersonId) revalidatePath(`/people/${subjectPersonId}`);
  if (subjectServiceUserId) revalidatePath(`/service-users/${subjectServiceUserId}`);
  return { ok: "Booked." };
}

/** Quick-book a due check straight from the Whiteboard: books it to the current
 *  user on the check's due date (30 minutes). It can be rescheduled/reassigned
 *  afterwards. Reuses createBooking for validation, branch derivation and audit. */
export async function quickBookCheck(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const instanceId = String(formData.get("check_instance_id") ?? "").trim();
  if (!instanceId) return { error: "Missing check." };

  const supabase = await createClient();
  const { data: inst } = await supabase
    .from("check_instances")
    .select("record_type, person_id, service_user_id, due_date, company_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst || inst.company_id !== profile.company_id) return { error: "Check not found." };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const fd = new FormData();
  fd.set("subject_kind", inst.record_type === "person" ? "person" : "service_user");
  fd.set("subject_id", String(inst.record_type === "person" ? inst.person_id : inst.service_user_id));
  fd.set("check_instance_id", instanceId);
  fd.set("conductor_id", user.id);
  fd.set("scheduled_date", (inst.due_date as string | null) ?? today);
  return createBooking(fd);
}

async function loadBooking(bookingId: string, companyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_bookings")
    // conductor_profile_id is needed by the clash check on reschedule: moving a booking can
    // put its conductor on top of another one just as easily as creating it can.
    .select("id, company_id, subject_person_id, subject_service_user_id, conductor_profile_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) return null;
  return data;
}

/** Reschedule a booking (date, time, duration). */
export async function rescheduleBooking(formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const startTimeResult = normaliseStartTime(formData.get("start_time"));
  if (!startTimeResult.ok) return { error: startTimeResult.error };
  const startTime = startTimeResult.value;
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  if (!bookingId || !scheduledDate) return { error: "Missing booking or date." };
  const existing = await loadBooking(bookingId, profile.company_id);
  if (!existing) return { error: "Booking not found." };

  const duration = durationRaw ? Math.max(5, Number(durationRaw) || 30) : 30;
  const supabase = await createClient();

  /* Rescheduling can create a clash just as easily as booking can. Ignoring the booking
     being moved matters: without that it would collide with its own old slot and refuse to
     save an unchanged time. */
  const clash = await findClash(
    supabase,
    profile.company_id,
    scheduledDate,
    startTime,
    duration,
    {
      conductorId: existing.conductor_profile_id,
      personId: existing.subject_person_id,
      serviceUserId: existing.subject_service_user_id,
    },
    bookingId,
  );
  if (clash) return { error: clash };

  const { data, error } = await supabase
    .from("planner_bookings")
    .update({
      scheduled_date: scheduledDate,
      start_time: startTime,
      duration_minutes: duration,
      updated_by: user.id,
    })
    .eq("id", bookingId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "planner.booking_rescheduled",
    entityType: "planner_booking",
    entityId: bookingId,
    summary: `Rescheduled a booking to ${ukDate(scheduledDate)}`,
  });

  revalidatePlanner();
  if (existing.subject_person_id) revalidatePath(`/people/${existing.subject_person_id}`);
  if (existing.subject_service_user_id) revalidatePath(`/service-users/${existing.subject_service_user_id}`);
  return { ok: "Rescheduled." };
}

async function setBookingStatus(
  bookingId: string,
  status: "completed" | "cancelled",
  verb: string,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const existing = await loadBooking(bookingId, profile.company_id);
  if (!existing) return { error: "Booking not found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planner_bookings")
    .update({ status, updated_by: user.id })
    .eq("id", bookingId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: `planner.booking_${status}`,
    entityType: "planner_booking",
    entityId: bookingId,
    summary: `${verb} a booking`,
  });

  revalidatePlanner();
  if (existing.subject_person_id) revalidatePath(`/people/${existing.subject_person_id}`);
  if (existing.subject_service_user_id) revalidatePath(`/service-users/${existing.subject_service_user_id}`);
  return { ok: `${verb}.` };
}

/** Mark a booking done by hand (mainly for ad-hoc bookings; check-linked bookings
 *  complete automatically when the check is completed). */
export async function completeBooking(formData: FormData): Promise<ActionState> {
  return setBookingStatus(String(formData.get("booking_id") ?? "").trim(), "completed", "Completed");
}

/** Cancel a booking. */
export async function cancelBooking(formData: FormData): Promise<ActionState> {
  return setBookingStatus(String(formData.get("booking_id") ?? "").trim(), "cancelled", "Cancelled");
}

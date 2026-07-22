"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";

function revalidatePlanner() {
  revalidatePath("/planner");
  revalidatePath("/planner/whiteboard");
}

/** Book a task: either against one of a record's checks, or ad-hoc. Lands on the
 *  chosen conductor's planner and the branch whiteboard. */
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
  const startTime = String(formData.get("start_time") ?? "").trim();
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
      start_time: startTime || null,
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
    summary: `Booked ${checkKind || title || "a task"} for ${scheduledDate}`,
  });

  revalidatePlanner();
  if (subjectPersonId) revalidatePath(`/people/${subjectPersonId}`);
  if (subjectServiceUserId) revalidatePath(`/service-users/${subjectServiceUserId}`);
  return { ok: "Booked." };
}

async function loadBooking(bookingId: string, companyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planner_bookings")
    .select("id, company_id, subject_person_id, subject_service_user_id")
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
  const startTime = String(formData.get("start_time") ?? "").trim();
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  if (!bookingId || !scheduledDate) return { error: "Missing booking or date." };
  const existing = await loadBooking(bookingId, profile.company_id);
  if (!existing) return { error: "Booking not found." };

  const duration = durationRaw ? Math.max(5, Number(durationRaw) || 30) : 30;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planner_bookings")
    .update({
      scheduled_date: scheduledDate,
      start_time: startTime || null,
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
    summary: `Rescheduled a booking to ${scheduledDate}`,
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

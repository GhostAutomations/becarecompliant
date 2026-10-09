"use server";

/**
 * Be Care Compliant — Holiday server actions.
 *
 *   requestHoliday        : anyone submits their own request (Holiday Form -> Evidence)
 *                           and a pending holiday_requests row is created.
 *   decideHoliday         : a Manager/Admin approves or declines; decide_holiday_request
 *                           stamps the outcome (a decision, never a form).
 *   amendHoliday, cancelHoliday : the office changes or cancels, with a reason (0438).
 *   requestHolidayChange, requestHolidayCancel, withdrawHolidayChange : a carer changes or
 *                           cancels their own holiday before it starts (0438).
 *   dismissHolidayNotice  : a carer presses Got it on a portal notice (0438).
 * No balance/entitlement tracking (approve/deny only).
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers, FormSchema } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getCompanyFormByKey } from "@/lib/people/data";
import { seedIdentityAnswers } from "@/lib/assignments/render";
import { ukDate } from "@/lib/dates";
import {
  notifyHolidayRequested,
  notifyHolidayDecided,
  notifyHolidayChanged,
  notifyHolidayChangeRequested,
  notifyHolidayChangeDecided,
} from "@/lib/notifications/holiday";

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function collectFiles(formData: FormData): Promise<EvidenceFileInput[]> {
  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }
  return files;
}

/** Submit a holiday request (against my own linked Person record when it exists). */
export async function requestHoliday(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const startDate = isoOrNull(answers["start_date_of_holiday"]);
  const endDate = isoOrNull(answers["end_date_of_holiday"]);
  if (!startDate || !endDate) {
    return { error: "Enter the start and end dates of your holiday." };
  }

  const supabase = await createClient();

  // Resolve the requester's own Person record + branch via people.profile_id.
  const { data: myPerson } = await supabase
    .from("people")
    .select("id, branch_id, full_name, work_email")
    .eq("company_id", companyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  let personId = (myPerson?.id as string | null) ?? null;
  let branchId = (myPerson?.branch_id as string | null) ?? null;
  if (!branchId) {
    const { data: ub } = await supabase
      .from("user_branches")
      .select("branch_id")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();
    branchId = (ub?.branch_id as string | null) ?? null;
  }

  const form = await getCompanyFormByKey(companyId, "holiday_requests");
  if (!form) {
    return {
      error:
        "The Holiday Form is not available for your company yet. It seeds into new companies; existing companies need it imported.",
    };
  }

  // The portal Holiday form no longer asks the carer their own name, email or area
  // (briefingRenderSchema drops them). Seed name/email back so the Evidence still names
  // them; branch is never seeded, and the request row carries the real branch_id anyway.
  const seededAnswers = seedIdentityAnswers(form.schema as FormSchema, answers, {
    fullName: (myPerson?.full_name as string | null) ?? profile.full_name ?? null,
    email: (myPerson?.work_email as string | null) ?? profile.email ?? null,
  });

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId,
    answers: seededAnswers,
    files: await collectFiles(formData),
    recordType: personId ? "person" : null,
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

  const { data: requestRow, error: insErr } = await supabase
    .from("holiday_requests")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      person_id: personId,
      requested_by: user.id,
      requester_name: profile.full_name || profile.email,
      start_date: startDate,
      end_date: endDate,
      note: typeof answers["note"] === "string" ? (answers["note"] as string) : null,
      status: "pending",
      request_evidence_id: result.evidenceId,
    })
    .select("id")
    .single();
  if (insErr || !requestRow) {
    return { error: `Evidence was saved, but the request could not be logged: ${insErr?.message ?? "no id returned"}` };
  }

  // Phase 6: tell the approvers (branch Managers + Company Admins). Best-effort,
  // idempotent, silently skipped when Resend is not configured.
  const approverEmails = await notifyHolidayRequested({
    companyId,
    branchId,
    requestId: requestRow.id as string,
    requesterName: profile.full_name || profile.email,
    startDate,
    endDate,
  });

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.requested",
    entityType: "holiday_request",
    entityId: personId,
    summary: `Requested holiday ${ukDate(startDate)} to ${ukDate(endDate)}`,
    metadata: {
      evidence_id: result.evidenceId,
      start_date: startDate,
      end_date: endDate,
      request_id: requestRow.id,
      approver_emails: approverEmails,
    },
  });

  revalidatePath("/people/holiday");
  return { ok: "Request submitted." };
}

/** A Manager/Admin books holiday ON BEHALF of a chosen staff member. The manager is
 *  the authority, so it is recorded as approved directly (shows on the calendar).
 *  Completes the Holiday Form as Evidence against that person. */
export async function bookHolidayForPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Choose a person to book holiday for." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const startDate = isoOrNull(answers["start_date_of_holiday"]);
  const endDate = isoOrNull(answers["end_date_of_holiday"]);
  if (!startDate || !endDate) {
    return { error: "Enter the start and end dates of the holiday." };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("full_name, branch_id, company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That person could not be found." };

  const form = await getCompanyFormByKey(companyId, "holiday_requests");
  if (!form) {
    return { error: "The Holiday Form is not available for your company yet." };
  }

  // Branch Manager and above book directly (approved); a Supervisor's booking is
  // logged as pending until a Branch Manager or higher approves it.
  //
  // ASK THE DATABASE, do not restate it. Migration 0206 puts this rule in a BEFORE
  // INSERT trigger, because until then it lived only here: the INSERT policy never
  // looked at `status`, so anybody in the company could POST an already approved
  // holiday for anybody, in any branch. A role list here would answer a different
  // question from the trigger's for a Branch Manager booking outside their own
  // branches, and the insert would then be refused AFTER the Evidence was written,
  // leaving an Evidence row with no request behind it. One source, asked first.
  const { data: mayApprove } = await supabase.rpc("can_manage_holiday", {
    p_company: companyId,
    p_branch: (person.branch_id as string | null) ?? null,
  });
  const canApproveOwn = mayApprove === true;

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };
  const { error: insErr } = await supabase.from("holiday_requests").insert({
    company_id: companyId,
    branch_id: (person.branch_id as string | null) ?? null,
    person_id: personId,
    requested_by: user.id,
    requester_name: person.full_name as string,
    start_date: startDate,
    end_date: endDate,
    status: canApproveOwn ? "approved" : "pending",
    request_evidence_id: result.evidenceId,
    decided_by: canApproveOwn ? user.id : null,
    decided_at: canApproveOwn ? new Date().toISOString() : null,
  });
  if (insErr) {
    return { error: `Evidence was saved, but the booking could not be logged: ${insErr.message}` };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.booked",
    entityType: "holiday_request",
    entityId: personId,
    summary: `Booked holiday for ${person.full_name} from ${ukDate(startDate)} to ${ukDate(endDate)}`,
    metadata: { evidence_id: result.evidenceId, start_date: startDate, end_date: endDate },
  });

  revalidatePath("/people/holiday");
  return { ok: canApproveOwn ? "Holiday booked." : "Holiday booked, pending approval." };
}

/** The newest history row this person wrote on this holiday: what an email is about. */
async function latestEventId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
  actorId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("holiday_request_events")
    .select("id")
    .eq("request_id", requestId)
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/** The text of a required reason box, or null when it was left empty. */
function reasonFrom(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v.slice(0, 2000) : null;
}

function revalidateHoliday(): void {
  revalidatePath("/people/holiday");
  revalidatePath("/my");
}

type ChangeRow = {
  company_id: string;
  branch_id: string | null;
  requester_name: string | null;
  start_date: string;
  end_date: string;
  return_to_work_date: string | null;
  status: string;
  change_kind: string | null;
  change_reason: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
};

const CHANGE_COLUMNS =
  "company_id, branch_id, requester_name, start_date, end_date, return_to_work_date, status, change_kind, change_reason, previous_start_date, previous_end_date";

/**
 * Approve or decline a holiday request (Branch Manager and above).
 *
 * This is a DECISION, not a form. The old Holiday Response form (inherited from
 * Monday.com) made a Manager complete a form to click yes or no; it was deleted
 * from every company and from the founder library in migration 0129. The
 * outcome, who decided it, when, and any reason for declining all live on the
 * holiday_requests row, and the person is emailed either way.
 *
 * A change or cancellation the carer asked for (0438) is decided with the same two
 * buttons: approved, it is applied; declined, the holiday goes back to what was agreed.
 */
export async function decideHoliday(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing request." };

  const decision = String(formData.get("decision") ?? "").toLowerCase();
  const status =
    decision === "approved" ? "approved" : decision === "declined" ? "declined" : null;
  if (!status) return { error: "Choose whether to approve or decline the request." };

  const note = reasonFrom(formData, "decline_reason");
  if (status === "declined" && !note) {
    return { error: "Give a reason for declining, so the person knows why." };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That request could not be found." };

  const { error: decErr } = await supabase.rpc("decide_holiday_request", {
    p_id: requestId,
    p_status: status,
    p_evidence_id: null,
    p_note: note,
  });
  if (decErr) {
    return { error: `The decision could not be recorded: ${decErr.message}` };
  }

  const changeKind = request.change_kind;
  let emailed: Record<string, string>;
  if (changeKind === "amend" || changeKind === "cancel") {
    const kind =
      changeKind === "amend"
        ? status === "approved" ? "change_approved" : "change_declined"
        : status === "approved" ? "cancel_approved" : "cancel_declined";
    // A declined change puts the agreed dates back; anything else leaves the dates as they are.
    const keptStart =
      kind === "change_declined" ? (request.previous_start_date ?? request.start_date) : request.start_date;
    const keptEnd =
      kind === "change_declined" ? (request.previous_end_date ?? request.end_date) : request.end_date;
    const eventId = (await latestEventId(supabase, requestId, user.id)) ?? `${requestId}:${kind}:${Date.now()}`;
    emailed = await notifyHolidayChangeDecided({
      companyId: request.company_id,
      branchId: request.branch_id,
      requestId,
      eventId,
      actorId: user.id,
      kind,
      startDate: keptStart,
      endDate: keptEnd,
      otherStart: kind === "change_declined" ? request.start_date : request.previous_start_date,
      otherEnd: kind === "change_declined" ? request.end_date : request.previous_end_date,
      note,
    });
  } else {
    emailed = await notifyHolidayDecided({
      companyId: request.company_id,
      branchId: request.branch_id,
      requestId,
      status,
      startDate: request.start_date,
      endDate: request.end_date,
      note,
    });
  }

  const what = changeKind === "amend" ? "Change of holiday" : changeKind === "cancel" ? "Cancellation request" : "Holiday request";
  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: changeKind ? "holiday.change_decided" : "holiday.decided",
    entityType: "holiday_request",
    entityId: requestId,
    summary: `${what} ${status}`,
    metadata: { status, note, change_kind: changeKind, requester_email: emailed },
  });

  revalidateHoliday();
  if (changeKind === "amend") return { ok: status === "approved" ? "Change approved." : "Change declined. The agreed dates stand." };
  if (changeKind === "cancel") return { ok: status === "approved" ? "Holiday cancelled." : "Cancellation declined. The holiday stays booked." };
  return { ok: status === "approved" ? "Holiday approved." : "Holiday declined." };
}

/**
 * The office cancels a holiday, pending or approved, with a reason the person sees
 * (Branch Manager and above; cancel_holiday_request enforces it). A carer cancels
 * their own through requestHolidayCancel, which holds the carer's rules.
 */
export async function cancelHoliday(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing holiday." };
  const reason = reasonFrom(formData, "cancel_reason");
  if (!reason) return { error: "Give a reason for cancelling. The person will see it." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That holiday could not be found." };
  const wasApproved = request.status === "approved";

  const { error } = await supabase.rpc("cancel_holiday_request", {
    p_id: requestId,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  // A change in flight goes with it, and the holiday keeps the dates that had been agreed.
  const agreedStart = request.previous_start_date ?? request.start_date;
  const agreedEnd = request.previous_end_date ?? request.end_date;
  const emailed = await notifyHolidayChanged({
    companyId: request.company_id,
    branchId: request.branch_id,
    requestId,
    actorId: user.id,
    kind: "cancelled",
    startDate: agreedStart,
    endDate: agreedEnd,
    reason,
  });

  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.cancelled",
    entityType: "holiday_request",
    entityId: requestId,
    summary: `Cancelled ${wasApproved ? "an approved" : "a pending"} holiday for ${request.requester_name ?? "a team member"}`,
    metadata: { reason, was_approved: wasApproved, change_kind: request.change_kind, emailed },
  });

  revalidateHoliday();
  return { ok: "Holiday cancelled." };
}

/** The office corrects the dates on a pending or approved holiday, with a reason (Branch Manager and above). */
export async function amendHoliday(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing holiday." };
  const startDate = isoOrNull(formData.get("start_date"));
  const endDate = isoOrNull(formData.get("end_date"));
  if (!startDate || !endDate) return { error: "Enter both dates." };
  if (endDate < startDate) return { error: "The end date cannot be before the start date." };
  /* Back at work goes with the dates (0440): the box is filled in as the day after the new end. */
  const returnToWork = isoOrNull(formData.get("return_to_work"));
  if (returnToWork && returnToWork <= endDate) {
    return { error: "The back at work date must be after the last day of the holiday." };
  }
  const reason = reasonFrom(formData, "amend_reason");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That holiday could not be found." };

  const wasStart = request.start_date;
  const wasEnd = request.end_date;
  /* "current_return_to_work" is what the screen showed (the form's answer when nothing was agreed
     since), used only to recognise a save that changed nothing. */
  const shownBack = isoOrNull(formData.get("current_return_to_work")) ?? request.return_to_work_date ?? null;
  if (wasStart === startDate && wasEnd === endDate && (returnToWork ?? null) === shownBack) {
    return { ok: "No change." };
  }
  if (!reason) return { error: "Give a reason for the change. The person will see it." };

  const { error } = await supabase.rpc("amend_holiday_request", {
    p_id: requestId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_reason: reason,
    p_return_to_work: returnToWork,
  });
  if (error) return { error: error.message };

  const emailed = await notifyHolidayChanged({
    companyId: request.company_id,
    branchId: request.branch_id,
    requestId,
    actorId: user.id,
    kind: "amended",
    startDate,
    endDate,
    previousStart: wasStart,
    previousEnd: wasEnd,
    reason,
  });

  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.amended",
    entityType: "holiday_request",
    entityId: requestId,
    summary: `Changed a holiday from ${ukDate(wasStart)} to ${ukDate(wasEnd)}, now ${ukDate(startDate)} to ${ukDate(endDate)}`,
    metadata: { was_start: wasStart, was_end: wasEnd, start_date: startDate, end_date: endDate, return_to_work: returnToWork, reason, emailed },
  });

  revalidateHoliday();
  return { ok: "Dates updated." };
}

/**
 * A carer changes the dates of their own holiday, before it starts (0438). Not decided yet: the
 * request simply asks for the new dates. Approved: it goes back to pending as a Change of holiday.
 * Either way the approvers are told, with the reason.
 */
export async function requestHolidayChange(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing holiday." };
  const startDate = isoOrNull(formData.get("start_date"));
  const endDate = isoOrNull(formData.get("end_date"));
  if (!startDate || !endDate) return { error: "Enter both dates." };
  if (endDate < startDate) return { error: "The end date cannot be before the start date." };
  const returnToWork = isoOrNull(formData.get("return_to_work"));
  if (returnToWork && returnToWork <= endDate) {
    return { error: "The back at work date must be after the last day of the holiday." };
  }
  const reason = reasonFrom(formData, "change_reason");
  if (!reason) return { error: "Give a reason for the change." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That holiday could not be found." };

  const shownBack = isoOrNull(formData.get("current_return_to_work")) ?? request.return_to_work_date ?? null;
  // A portal holiday booked before 0440 has no agreed Back at work on file: same dates is no change.
  if (request.start_date === startDate && request.end_date === endDate && (shownBack === null || (returnToWork ?? null) === shownBack)) {
    return { error: "Those are the dates it already has." };
  }

  const { data: kind, error } = await supabase.rpc("request_holiday_change", {
    p_id: requestId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_reason: reason,
    p_return_to_work: returnToWork,
  });
  if (error) return { error: error.message };

  // What the approvers are told the holiday WAS: the dates agreed if a change was already waiting.
  const wasStart = request.change_kind === "amend" ? (request.previous_start_date ?? request.start_date) : request.start_date;
  const wasEnd = request.change_kind === "amend" ? (request.previous_end_date ?? request.end_date) : request.end_date;
  const eventId = (await latestEventId(supabase, requestId, user.id)) ?? `${requestId}:${String(kind)}:${Date.now()}`;
  const emailed = await notifyHolidayChangeRequested({
    companyId: request.company_id,
    branchId: request.branch_id,
    requestId,
    eventId,
    requesterName: request.requester_name || profile.full_name || profile.email,
    kind: kind === "change_requested" ? "change" : "request_amended",
    oldStart: wasStart,
    oldEnd: wasEnd,
    newStart: startDate,
    newEnd: endDate,
    reason,
  });

  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: kind === "change_requested" ? "holiday.change_requested" : "holiday.request_amended",
    entityType: "holiday_request",
    entityId: requestId,
    summary: `Asked to move a holiday from ${ukDate(wasStart)} to ${ukDate(wasEnd)}, to ${ukDate(startDate)} to ${ukDate(endDate)}`,
    metadata: { was_start: wasStart, was_end: wasEnd, start_date: startDate, end_date: endDate, reason, approver_emails: emailed },
  });

  revalidateHoliday();
  return {
    ok:
      kind === "change_requested"
        ? "Change sent for approval."
        : "Dates changed. Your manager has been told.",
  };
}

/**
 * A carer cancels their own holiday, before it starts (0438). Not decided yet: withdrawn straight
 * away. Approved, or a change waiting: a Cancellation request for the office to decide.
 */
export async function requestHolidayCancel(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing holiday." };
  const reason = reasonFrom(formData, "cancel_reason");
  if (!reason) return { error: "Give a reason for cancelling." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That holiday could not be found." };

  const { data: kind, error } = await supabase.rpc("request_holiday_cancel", {
    p_id: requestId,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  const agreedStart = request.previous_start_date ?? request.start_date;
  const agreedEnd = request.previous_end_date ?? request.end_date;
  let emailed: Record<string, string> = {};
  if (kind === "cancel_requested") {
    const eventId = (await latestEventId(supabase, requestId, user.id)) ?? `${requestId}:cancel:${Date.now()}`;
    emailed = await notifyHolidayChangeRequested({
      companyId: request.company_id,
      branchId: request.branch_id,
      requestId,
      eventId,
      requesterName: request.requester_name || profile.full_name || profile.email,
      kind: "cancel",
      oldStart: agreedStart,
      oldEnd: agreedEnd,
      reason,
    });
  }

  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: kind === "cancel_requested" ? "holiday.cancel_requested" : "holiday.withdrawn",
    entityType: "holiday_request",
    entityId: requestId,
    summary:
      kind === "cancel_requested"
        ? `Asked to cancel a holiday from ${ukDate(agreedStart)} to ${ukDate(agreedEnd)}`
        : "Withdrew their own holiday request",
    metadata: { reason, approver_emails: emailed },
  });

  revalidateHoliday();
  return { ok: kind === "cancel_requested" ? "Cancellation sent for approval." : "Request withdrawn." };
}

/** A carer takes back their change or cancellation request: the agreed holiday stands again (0438). */
export async function withdrawHolidayChange(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing holiday." };
  const reason = reasonFrom(formData, "withdraw_reason");
  if (!reason) return { error: "Give a reason." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select(CHANGE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle<ChangeRow>();
  if (!request) return { error: "That holiday could not be found." };

  const { error } = await supabase.rpc("withdraw_holiday_change", {
    p_id: requestId,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  await writeAudit({
    companyId: request.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.change_withdrawn",
    entityType: "holiday_request",
    entityId: requestId,
    summary:
      request.change_kind === "cancel"
        ? "Took back their request to cancel a holiday"
        : "Took back their change of holiday",
    metadata: { reason, change_kind: request.change_kind },
  });

  revalidateHoliday();
  return { ok: "Done. Your holiday stays as it was agreed." };
}

/** Got it, on a portal notice about the office changing their holiday (0438). */
export async function dismissHolidayNotice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCompany();
  const eventId = String(formData.get("event_id") ?? "");
  if (!eventId) return { error: "Missing notice." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_holiday_notice_seen", { p_event_id: eventId });
  if (error) return { error: error.message };
  revalidatePath("/my");
  return { ok: "Got it." };
}

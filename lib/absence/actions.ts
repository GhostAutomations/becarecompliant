"use server";

/**
 * Be Care Compliant — Absence server actions.
 *
 * Both flows store immutable Evidence through the shared pipeline
 * (submitEvidence, record_type='person') using the founder forms already in the
 * library, then write the dedicated row(s) that drive the Absence view:
 *   recordAbsence        -> Absence Back Office form  -> absence_events
 *   recordAbsenceMeeting -> Absence Management Meeting -> absence_meetings (Stage)
 * Manager/Admin only (RLS on the tables + the form).
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  type BranchAddressRow,
  officeAddress,
  resolveBranchAddress,
} from "@/lib/branches/office-address";
import { profilesById } from "@/lib/auth/company-profiles";

/** Who may hold a formal absence meeting. Mirrors listMeetingConductors in lib/absence/data.ts. */
const CONDUCTOR_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager"];
import { writeAudit } from "@/lib/audit";
import { renderCalendarInvite, sendCalendarInvite } from "@/lib/notifications/invites";
import type { LetterPreview, LetterPreviewState } from "@/lib/absence/letter-preview";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml } from "@/lib/email/templates";
import { letterWordingFor } from "@/lib/letters/data";
import { ukDate } from "@/lib/dates";
import { mergeLetterText, renderLetterHtml, renderLetterSubject } from "@/lib/letters/letters";
import { buildInvitationLetter, type InvitationLetter } from "@/lib/absence/invitation-letter";
import { renderInvitationLetterPdf } from "@/lib/absence/invitation-letter-pdf";
import { loadLetterExtras, stageLabelFor, companyMeetingName } from "@/lib/absence/letter-extras";
import { meetingNameAsTitle } from "@/lib/absence/meeting-name";
import { keepMeetingLetter, REBUILT_NOTICE } from "@/lib/absence/meeting-letter-copy";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { londonToUtc } from "@/lib/email/ics";
import { siteUrl } from "@/lib/site";
import { getAbsenceConfig } from "@/lib/absence/data";
import { deriveAbsenceStatus } from "@/lib/absence/logic";
import { stageActionFor, stageActionSentence, warningAllowed, warningTooHighMessage } from "@/lib/absence/stage-actions";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import { toAiQuestions, type ActionState, type AiQuestion } from "@/lib/forms";
import { getCompanyFormByKey } from "@/lib/people/data";
import { stageFrom, unbookedMeetingProblem } from "@/lib/absence/record-meeting";

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Inclusive day count between two civil dates (>= 1). */
function inclusiveDays(startIso: string, endIso: string | null): number {
  if (!endIso || endIso < startIso) return 1;
  const ms = Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
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

/** Record one or more absences for a Person via the Absence Back Office form. */
export async function recordAbsence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("branch_id, company_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };

  const form = await getCompanyFormByKey(profile.company_id, "absence_back_office");
  if (!form) {
    return {
      error:
        "The Absence Back Office form is not available for your company yet. It seeds into new companies; existing companies need it imported.",
    };
  }

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

  // One absence = a first date + an (optional) last date, so a multi-day absence
  // stays a SINGLE occasion (editable later via View absence) rather than several.
  const startDate = isoOrNull(answers["first_date_of_absence"]);
  if (!startDate) {
    return { error: "Evidence was saved, but no first date of absence was entered." };
  }
  const endDate = isoOrNull(answers["last_date_of_absence"]);
  const reason = typeof answers["reason"] === "string" ? (answers["reason"] as string) : null;

  const { error: insErr } = await supabase.from("absence_events").insert({
    company_id: person.company_id as string,
    branch_id: (person.branch_id as string | null) ?? null,
    person_id: personId,
    start_date: startDate,
    end_date: endDate,
    days: inclusiveDays(startDate, endDate),
    reason,
    evidence_id: result.evidenceId,
    recorded_by: user.id,
  });
  if (insErr) {
    return { error: `Evidence was saved, but the absence could not be logged: ${insErr.message}` };
  }

  await writeAudit({
    companyId: person.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.recorded",
    entityType: "person",
    entityId: personId,
    summary: `Recorded an absence from ${ukDate(startDate)}${endDate ? ` to ${ukDate(endDate)}` : ""}`,
    metadata: { evidence_id: result.evidenceId, start_date: startDate, end_date: endDate },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${personId}`);
  return { ok: "Absence recorded." };
}

/** Edit a recorded absence's last date (e.g. a multi-day absence). Recomputes the
 *  day count. Manager/Admin only (RLS). Keeps it ONE occasion, not several. */
export async function updateAbsenceEndDate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("absence_id") ?? "");
  if (!id) return { error: "Missing absence." };

  const rawEnd = String(formData.get("end_date") ?? "").trim();
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : null;

  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("absence_events")
    .select("start_date, person_id, company_id")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return { error: "That absence could not be found." };

  const startDate = ev.start_date as string;
  if (endDate && endDate < startDate) {
    return { error: "The last date cannot be before the first date." };
  }

  const { error } = await supabase
    .from("absence_events")
    .update({ end_date: endDate, days: inclusiveDays(startDate, endDate) })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit({
    companyId: ev.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.updated",
    entityType: "person",
    entityId: ev.person_id as string,
    summary: `Updated an absence last date to ${endDate ? ukDate(endDate) : "(cleared)"}`,
    metadata: { absence_id: id, end_date: endDate },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${ev.person_id}`);
  return { ok: "Absence updated." };
}

/** Record a formal absence-management meeting (Stage 1..4) for a Person. */
export async function recordAbsenceMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("branch_id, company_id, full_name, work_email, profile_id, manager_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };

  const form = await getCompanyFormByKey(
    profile.company_id,
    "absence_management_meeting",
  );
  if (!form) {
    return {
      error:
        "The Absence Management Meeting form is not available for your company yet.",
    };
  }

  // Stage from the "Meeting Type (tick as appropriate)" answer, e.g. "Stage 2".
  const rawStage = String(answers["meeting_type"] ?? "");
  const stageMatch = rawStage.match(/(\d)/);
  const stage = stageMatch ? Number.parseInt(stageMatch[1], 10) : null;
  const meetingDate = isoOrNull(answers["date_of_meeting"]);

  // Recording logs a meeting that has HAPPENED (no invitations: those go out
  // when the meeting is BOOKED, see bookAbsenceMeeting). If an open booking
  // exists for this person (and stage, when given), the Evidence attaches to
  // it so one meeting stays one entry; otherwise a new row is inserted.
  const validStage = stage && stage >= 1 && stage <= 4 ? stage : null;
  let bookingQuery = supabase
    .from("absence_meetings")
    .select("id")
    .eq("person_id", personId)
    .is("evidence_id", null)
    // declined bookings are not booked in (Phil): never attach to them
    .or("response.is.null,response.eq.accepted")
    .order("meeting_date", { ascending: false })
    .limit(1);
  if (validStage) bookingQuery = bookingQuery.eq("stage", validStage);
  const { data: openBooking } = await bookingQuery.maybeSingle();

  /* A MEETING WITH NO BOOKING BEHIND IT (DEF-072, Phil 2026-09-24: "Allow a meeting already
     held"). Checked BEFORE the Evidence is filed, so a refused meeting leaves nothing behind.
     No letters or invites are sent from here in either case: recording is after the event. */
  if (!openBooking) {
    const problem = unbookedMeetingProblem({
      stage: stageFrom(answers["meeting_type"]),
      dateIso: meetingDate,
      todayIso: formatCivilDate(todayInLondon()),
    });
    if (problem) return { error: problem };
  }

  // Up to and including (Phil, 2026-09-29): a warning above what the stage allows in Settings,
  // Absence is refused here, before any Evidence exists. No action set means nothing to hold it to.
  if (validStage) {
    const stageAction = stageActionFor(await getAbsenceConfig(person.company_id as string), validStage);
    if (!warningAllowed(stageAction, answers["warning_issued"] as string | undefined)) {
      return { error: warningTooHighMessage(validStage, stageAction!) };
    }
  }

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

  let meetingId: string | null = null;
  let attachedToBooking = false;
  if (openBooking) {
    const { error: updErr } = await supabase
      .from("absence_meetings")
      .update({
        evidence_id: result.evidenceId,
        meeting_date: meetingDate,
        stage: validStage,
        recorded_by: user.id,
      })
      .eq("id", openBooking.id);
    if (updErr) {
      return { error: `Evidence was saved, but the booked meeting could not be updated: ${updErr.message}` };
    }
    meetingId = openBooking.id as string;
    attachedToBooking = true;
  } else {
    const { data: meeting, error: insErr } = await supabase
      .from("absence_meetings")
      .insert({
        company_id: person.company_id as string,
        branch_id: (person.branch_id as string | null) ?? null,
        person_id: personId,
        stage: validStage,
        meeting_date: meetingDate,
        evidence_id: result.evidenceId,
        recorded_by: user.id,
      })
      .select("id")
      .single();
    if (insErr || !meeting) {
      return { error: `Evidence was saved, but the meeting could not be logged: ${insErr?.message ?? "no id returned"}` };
    }
    meetingId = meeting.id as string;
  }

  // The drafted questions, if any, are now asked and answered (0342): close their set so it is not
  // offered again, and keep the wording as it finally stood. The Evidence already holds the
  // questions and answers, so a failure here costs nothing but a stale draft; it never fails the
  // save.
  await closeMeetingQuestions(supabase, {
    personId,
    bookingId: attachedToBooking ? meetingId : null,
    meetingId,
    evidenceId: result.evidenceId,
    finalQuestions: finalAiQuestions(formData),
  });

  await writeAudit({
    companyId: person.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_recorded",
    entityType: "person",
    entityId: personId,
    summary: stage ? `Recorded a Stage ${stage} absence meeting` : "Recorded an absence meeting",
    metadata: {
      evidence_id: result.evidenceId,
      stage,
      meeting_id: meetingId,
      attached_to_booking: attachedToBooking,
    },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${personId}`);
  // Handed back so the screen can offer to discount the absences this meeting discussed (0328).
  return {
    ok: attachedToBooking ? "Meeting recorded against the booking." : "Meeting recorded.",
    data: { meeting_stage: validStage ? String(validStage) : "", meeting_date: meetingDate ?? "", meeting_id: meetingId ?? "" },
  };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** The drafted questions as they stood on screen when the meeting was saved, if any. */
function finalAiQuestions(formData: FormData): AiQuestion[] | null {
  const raw = formData.get("ai_questions_json");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as { questions?: unknown };
    const qs = toAiQuestions(parsed.questions);
    return qs.length > 0 ? qs : null;
  } catch {
    return null;
  }
}

async function closeMeetingQuestions(
  supabase: ServerClient,
  opts: {
    personId: string;
    bookingId: string | null;
    meetingId: string | null;
    evidenceId: string;
    finalQuestions: AiQuestion[] | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    evidence_id: opts.evidenceId,
    recorded_at: new Date().toISOString(),
    ...(opts.finalQuestions ? { questions: opts.finalQuestions } : {}),
  };
  let q = supabase.from("absence_meeting_questions").update(
    opts.bookingId ? patch : { ...patch, meeting_id: opts.meetingId },
  );
  q = opts.bookingId
    ? q.eq("meeting_id", opts.bookingId)
    : q.eq("person_id", opts.personId).is("meeting_id", null);
  const { error } = await q.is("evidence_id", null);
  if (error) console.error("[absence] meeting questions not closed", { meetingId: opts.meetingId, error: error.message });
}

/** Everything a booking needs, checked, before anything is written or sent. Shared by the
 *  preview (Phil, 2026-09-29: the letters are shown for approval first) and the booking itself,
 *  so the letters approved are built from exactly the same checked details. */
type BookingPlan = {
  supabase: ServerClient;
  personId: string;
  companyId: string;
  branchId: string | null;
  companyName: string;
  stage: number;
  meetingDate: string;
  rawTime: string;
  duration: number;
  location: string;
  locationKind: "office" | "teams";
  employee: { profileId: string | null; name: string; email: string | null };
  conductor: { id: string; name: string; email: string | null };
};

async function planBooking(formData: FormData): Promise<BookingPlan | { error: string }> {
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };
  const stage = Number.parseInt(String(formData.get("stage") ?? ""), 10);
  if (!Number.isFinite(stage) || stage < 1 || stage > 4) {
    return { error: "Choose the meeting stage." };
  }
  const meetingDate = isoOrNull(String(formData.get("meeting_date") ?? ""));
  if (!meetingDate) return { error: "Choose the meeting date." };
  const todayLondon = formatCivilDate(todayInLondon());
  if (meetingDate < todayLondon) {
    return { error: "The meeting date must be today or in the future. To log a past meeting use Record meeting." };
  }
  const rawTime = String(formData.get("meeting_time") ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(rawTime)) return { error: "Choose the meeting time." };
  // Formal notice period (Phil, 2026-07-12): at least 48 hours between sending
  // the invitation and the meeting itself. Enforced here, not just in the UI.
  const meetingInstant = londonToUtc(meetingDate, rawTime);
  if (meetingInstant.getTime() - Date.now() < 48 * 60 * 60 * 1000) {
    return {
      error:
        "Formal meetings need at least 48 hours notice. Choose a date and time at least two full days from now.",
    };
  }
  const rawDuration = Number.parseInt(String(formData.get("duration") ?? ""), 10);
  const duration =
    Number.isFinite(rawDuration) && rawDuration >= 15 && rawDuration <= 480 ? rawDuration : 60;
  const locationChoice = String(formData.get("location_choice") ?? "").trim();
  if (!locationChoice) {
    return { error: "Choose where the meeting will be held." };
  }
  const conductedBy = String(formData.get("conducted_by") ?? "").trim();
  if (!conductedBy) return { error: "Choose who is holding the meeting." };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("branch_id, company_id, full_name, work_email, profile_id, manager_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };

  // Location: Teams, or a named office whose FULL address (Settings > Branches)
  // is printed in the letters (Phil, 2026-07-12).
  const resolved = await resolveMeetingLocation(
    supabase,
    person.company_id as string,
    locationChoice,
  );
  if ("error" in resolved) return { error: resolved.error };
  const { location, locationKind } = resolved;

  // Stage gate (Phil, 2026-07-12): a stage that has already been held or
  // booked cannot be booked again; the next stage (or a repeat Stage 4) is
  // the only option. DECLINED open bookings do not count: declined means not
  // booked in (Phil), so that stage can be booked again. A "no further
  // action" outcome resetting the cycle arrives with meeting outcomes
  // (Additions).
  const { data: maxStageRow } = await supabase
    .from("absence_meetings")
    .select("stage")
    .eq("person_id", personId)
    .not("stage", "is", null)
    // held (has evidence), unanswered, or accepted count; declined opens do not
    .or("evidence_id.not.is.null,response.is.null,response.eq.accepted")
    .order("stage", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxStage = (maxStageRow?.stage as number | null) ?? 0;
  if (stage <= maxStage) {
    return {
      error: `Stage ${stage} has already been held or booked for this person. Book Stage ${Math.min(maxStage + 1, 4)} instead.`,
    };
  }

  // Upper cap (Phil, 2026-07-12): only stages the person's absence level
  // actually calls for can be booked (their derived stage from the company's
  // thresholds). Mirrors the dropdown, enforced here.
  const [{ data: summary }, config] = await Promise.all([
    supabase
      .from("person_absence_summary")
      .select("occasions, total_days, latest_meeting_stage")
      .eq("person_id", personId)
      .maybeSingle(),
    getAbsenceConfig(person.company_id as string),
  ]);
  const derived = deriveAbsenceStatus(
    {
      occasions: (summary?.occasions as number | null) ?? 0,
      totalDays: Number(summary?.total_days ?? 0),
      latestMeetingStage: (summary?.latest_meeting_stage as number | null) ?? null,
    },
    config,
  );
  const derivedStage = derived.derivedStage ?? 0;
  if (config.method === "stages" && stage > derivedStage) {
    return {
      error:
        derivedStage > 0
          ? `Their absence level calls for Stage ${derivedStage} at most. A Stage ${stage} meeting cannot be booked yet.`
          : "Their absence level does not call for a formal meeting yet.",
    };
  }

  const conductor = await resolveConductor(supabase, person.company_id as string, conductedBy);
  if ("error" in conductor) return conductor;

  const employeeEmail = await employeeEmailFor(person);
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", person.company_id as string).maybeSingle();

  return {
    supabase,
    personId,
    companyId: person.company_id as string,
    branchId: (person.branch_id as string | null) ?? null,
    companyName: company?.name ?? "Be Care Compliant",
    stage,
    meetingDate,
    rawTime,
    duration,
    location,
    locationKind,
    employee: {
      profileId: (person.profile_id as string | null) ?? null,
      name: person.full_name as string,
      email: employeeEmail,
    },
    conductor,
  };
}

/** The conductor must be an active Manager or Admin in THIS company. */
async function resolveConductor(
  supabase: ServerClient,
  companyId: string,
  conductedBy: string,
): Promise<{ id: string; name: string; email: string | null } | { error: string }> {
  /*
   * Through the definer path. Read from `profiles` directly this returned null for anybody but
   * the caller themselves, so a Manager choosing a colleague, and a Supervisor choosing anyone,
   * were refused with a message that was not true: "The meeting must be held by a Manager or
   * Admin in your company." It was. She just could not see them.
   *
   * company_profiles_by_id is NOT a company check on its own: since 0199 it also answers about
   * the caller's own id whatever company they are in, so the founder resolves his own name. The
   * company, the role and the active check are all carried by is_company_conductor below. Do not
   * delete that call as redundant.
   */
  const conductor = (await profilesById([conductedBy])).get(conductedBy);
  /*
   * ACTIVE is checked separately and on purpose. company_profiles_by_id deliberately answers
   * about leavers, so a meeting held in June still says who held it, which means the resolved
   * role alone no longer proves the person is still here. Without this a stale form left open
   * while that Manager was disabled would book the meeting and then post their invitation letter
   * to them. is_company_conductor is the same definer check the planner's trigger uses.
   */
  const { data: conductorActive } = await supabase.rpc("is_company_conductor", {
    cid: companyId,
    pid: conductedBy,
  });
  if (!conductor || !CONDUCTOR_ROLES.includes(conductor.role) || conductorActive !== true) {
    return { error: "The meeting must be held by a Manager or Admin in your company." };
  }
  return {
    id: conductor.id as string,
    name: conductor.name,
    email: (conductor.email as string | null) ?? null,
  };
}

/** The employee's address: their record's work email, else their login's. */
async function employeeEmailFor(
  person: { work_email?: unknown; profile_id?: unknown } | null,
): Promise<string | null> {
  let email = (person?.work_email as string | null) ?? null;
  if (!email && person?.profile_id) {
    // Definer path: read directly this was null for every caller who is not an admin, so the
    // letter was silently never sent to a carer whose only address is on their login.
    email =
      (await profilesById([person.profile_id as string])).get(person.profile_id as string)?.email ?? null;
  }
  return email;
}

/** Shows the two invitation letters exactly as Book would send them. Writes and sends nothing. */
export async function previewBookAbsenceMeeting(formData: FormData): Promise<LetterPreviewState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const plan = await planBooking(formData);
  if ("error" in plan) return { error: plan.error };
  return {
    letters: await previewMeetingLetters({
      ...letterArgsFrom(plan),
      meetingId: "preview",
      responseToken: "preview",
      rearranged: false,
    }),
  };
}

function letterArgsFrom(plan: {
  supabase: ServerClient;
  personId: string;
  companyId: string;
  branchId: string | null;
  companyName: string;
  stage: number;
  meetingDate: string;
  rawTime: string;
  duration: number;
  location: string;
  locationKind: "office" | "teams";
  employee: { profileId: string | null; name: string; email: string | null };
  conductor: { id: string; name: string; email: string | null };
}) {
  return {
    supabase: plan.supabase,
    personId: plan.personId,
    companyId: plan.companyId,
    branchId: plan.branchId,
    companyName: plan.companyName,
    stage: plan.stage,
    meetingDate: plan.meetingDate,
    timeHHMM: plan.rawTime,
    duration: plan.duration,
    location: plan.location,
    locationKind: plan.locationKind,
    employee: plan.employee,
    conductor: plan.conductor,
  };
}

/** Book a formal absence management meeting (Stage 1 to 4) for a future date.
 *  Creates the meeting entry (no Evidence yet: that comes when it is recorded)
 *  and sends the employee and their line manager a FORMAL LETTER invitation
 *  with a timed .ics calendar invite. Booked meetings count towards the
 *  person's meeting stage (Phil, 2026-07-12). The dialog shows both letters
 *  for approval first (previewBookAbsenceMeeting); this runs on Approve and
 *  send and re-checks everything. Emails silently no-op when Resend is
 *  missing; outcomes are audited. */
export async function bookAbsenceMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const plan = await planBooking(formData);
  if ("error" in plan) return { error: plan.error };
  const { supabase, personId, stage, meetingDate, rawTime, duration, location, conductor } = plan;

  const { data: meeting, error: insErr } = await supabase
    .from("absence_meetings")
    .insert({
      company_id: plan.companyId,
      branch_id: plan.branchId,
      person_id: personId,
      stage,
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      booked_by: user.id,
      conducted_by: conductor.id,
    })
    .select("id, response_token")
    .single();
  if (insErr || !meeting) {
    return { error: `The meeting could not be booked: ${insErr?.message ?? "no id returned"}` };
  }

  // Formal letter invitations: employee + conductor.
  const sent = await sendMeetingLetters(
    {
      ...letterArgsFrom(plan),
      meetingId: meeting.id as string,
      responseToken: meeting.response_token as string,
      rearranged: false,
    },
    { id: user.id, name: profile.full_name || profile.email },
  );
  const inviteOutcomes = sent.outcomes;

  await writeAudit({
    companyId: plan.companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_booked",
    entityType: "person",
    entityId: personId,
    summary: `Booked a Stage ${stage} absence meeting for ${ukDate(meetingDate)} at ${rawTime}`,
    metadata: {
      meeting_id: meeting.id,
      stage,
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      conducted_by: conductor.id,
      invites: inviteOutcomes,
      letter_copy: sent.copyNote ?? "kept",
    },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${personId}`);
  const sentCount = Object.values(inviteOutcomes).filter((v) => v === "sent").length;
  const base =
    sentCount > 0
      ? `Meeting booked. ${sentCount === 1 ? "1 invitation" : `${sentCount} invitations`} sent.`
      : "Meeting booked. No invitations could be sent (check email addresses).";
  // A copy that could not be kept is said out loud, never swallowed.
  // Always ok: the meeting IS booked and the letters went, so the dialog must not invite a second
  // booking. A copy that could not be kept is said in the same message, never swallowed.
  return { ok: `${base} ${sent.copyNote ?? "A copy of the letter is in their Evidence history."}` };
}

/** Resolve the booking's location choice: "teams", or the id of one of the
 *  company's offices (the Team office or a branch office). Offices must have
 *  their address set in Settings > Branches, or share the main office's; the
 *  full address is what the letters print. Ownership checked: the office must
 *  belong to this company. */
async function resolveMeetingLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  choice: string,
): Promise<{ location: string; locationKind: "office" | "teams" } | { error: string }> {
  if (choice === "teams") {
    return { location: "Microsoft Teams", locationKind: "teams" };
  }
  const { data: office } = await supabase
    .from("branches")
    .select("id, name, kind, address, uses_office_address, company_id")
    .eq("id", choice)
    .maybeSingle();
  if (!office || office.company_id !== companyId) {
    return { error: "Choose where the meeting will be held." };
  }
  /* A branch with no premises of its own shares the office address (migration 0222),
     so the office is read too and the error names the place that is actually blank. */
  const { data: rows } = await supabase
    .from("branches")
    .select("id, name, kind, address, uses_office_address")
    .eq("company_id", companyId);
  const companyOffice = officeAddress((rows ?? []) as BranchAddressRow[]);
  const { address, inherited } = resolveBranchAddress(
    office as unknown as BranchAddressRow,
    companyOffice,
  );
  if (!address) {
    return {
      error: inherited
        ? `${office.name} uses the main office address, and the office has no address yet. Set it in Settings, Branches first, then book the meeting.`
        : `That office has no address yet. Set it in Settings, Branches first, then book the meeting.`,
    };
  }
  return { location: address, locationKind: "office" };
}

type MeetingLetterArgs = {
  supabase: { from: (t: string) => any };
  personId: string;
  meetingId: string;
  responseToken: string;
  companyId: string;
  branchId: string | null;
  companyName: string;
  stage: number;
  meetingDate: string;
  timeHHMM: string;
  duration: number;
  location: string;
  locationKind: "office" | "teams";
  employee: { profileId: string | null; name: string; email: string | null };
  conductor: { id: string; name: string; email: string | null };
  rearranged: boolean;
  /** The date printed on the letter; today unless a copy is being made afterwards. */
  letterDateIso?: string;
};

type MeetingLetter = {
  key: "employee" | "conductor";
  profileId: string | null;
  name: string;
  email: string | null;
  eventTitle: string;
  detailHtml: string;
  hideCta: boolean;
};

type MeetingLetterSet = {
  letters: MeetingLetter[];
  /** The employee's letter, the PDF attached to both emails and kept in Evidence history. */
  invitation: InvitationLetter;
  logoDataUrl: string | null;
};

/** The formal letter pair for a booked or rearranged meeting.
 *
 *  THE EMPLOYEE (Phil, 2026-10-06, Thistle's format): a short branded email, "Dear Sarah Harris,
 *  please find attached a letter about your Stage 2 disciplinary hearing", with the Accept / I
 *  cannot attend buttons and the calendar invite, and the LETTER itself attached as a PDF laid out
 *  like the company's own: letterhead, date, home address, the company's wording, when and where,
 *  every absence it is about, and the sign off (invitation-letter.ts).
 *
 *  THE CONDUCTOR: the chairing copy as before (unambiguous that THEY are holding it, not attending
 *  one: Phil, 2026-07-12), with the same PDF attached so they have what the employee was sent.
 *
 *  Built once here and used for the approval preview and the send, so what is approved is what
 *  goes. A letter with no address comes back with email null. */
async function buildMeetingLetters(args: MeetingLetterArgs): Promise<MeetingLetterSet> {
  const extras = await loadLetterExtras({
    companyId: args.companyId,
    personId: args.personId,
    conductorId: args.conductor.id,
  });
  // What the company calls these meetings (0408): "Stage 2 disciplinary hearing" for Thistle.
  const stageLabel = stageLabelFor(args.stage, extras.meetingName);

  // The WORDING of these letters belongs to the company (Settings > Letters). We read
  // their version and fall back to the packaged default, so a letter can never fail to
  // send because wording is missing. Everything functional (the response buttons, the
  // calendar attachment, the Teams note) is still added by us, around their words.
  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(args.meetingDate)
    ? args.meetingDate.split("-").reverse().join("/")
    : args.meetingDate;
  const values: Record<string, string> = {
    recipient_name: args.employee.name,
    employee_name: args.employee.name,
    company_name: args.companyName,
    stage: String(args.stage),
    stage_label: stageLabel,
    conductor_name: args.conductor.name,
    meeting_date: displayDate,
    meeting_time: args.timeHHMM,
    meeting_when: `${displayDate} at ${args.timeHHMM}`,
    location: args.locationKind === "teams" ? "Microsoft Teams" : args.location,
    duration: `${args.duration} minutes`,
  };

  // What this stage can lead to (Settings, Absence; Phil 2026-09-29). Read here rather than
  // passed in, so booking and rearranging can never disagree about it.
  const stageAction = stageActionFor(await getAbsenceConfig(args.companyId), args.stage);
  values.stage_action = stageAction ?? "";
  values.stage_action_sentence = stageActionSentence(args.stage, stageAction);

  const [employeeLetter, conductorLetter, rearrangedLetter] = await Promise.all([
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_invite_employee"),
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_invite_conductor"),
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_rearranged"),
  ]);

  const paragraphsOf = (body: string) =>
    mergeLetterText(body, values)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

  const invitation = buildInvitationLetter({
    companyName: args.companyName,
    letterheadAddress: extras.letterheadAddress,
    letterheadPhone: extras.letterheadPhone,
    letterDateIso: args.letterDateIso ?? formatCivilDate(todayInLondon()),
    recipientName: args.employee.name,
    recipientAddress: extras.homeAddress,
    stage: args.stage,
    stageLabel,
    meetingTitle: meetingNameAsTitle(extras.meetingName),
    meetingDateIso: args.meetingDate,
    meetingTime: args.timeHHMM,
    durationMinutes: args.duration,
    location: args.location,
    teams: args.locationKind === "teams",
    conductorName: args.conductor.name,
    conductorRole: extras.conductorRole,
    wordingParagraphs: paragraphsOf(employeeLetter.body),
    rearrangedNote: args.rearranged ? paragraphsOf(rearrangedLetter.body).join(" ") || null : null,
    absences: extras.absences,
    windowWords: extras.windowWords,
  });

  const teamsNote =
    args.locationKind === "teams"
      ? `<p style="margin:0 0 10px 0;">A Teams invite will follow shortly.</p>`
      : "";
  const rearrangedNote = args.rearranged
    ? `<p style="margin:0 0 10px 0;color:#fcd34d;">${renderLetterHtml(rearrangedLetter.body, values)
        .replace(/<\/?p[^>]*>/g, "")
        .trim()}</p>`
    : "";
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const respondBase = `${siteUrl()}/meeting-response/${args.responseToken}`;
  const letters: MeetingLetter[] = [
    {
      key: "employee",
      profileId: args.employee.profileId,
      name: args.employee.name,
      email: args.employee.email,
      eventTitle: renderLetterSubject(employeeLetter.subject, values) || stageLabel,
      hideCta: true, // employees have no app account: no Open button
      detailHtml: `
        ${rearrangedNote}
        <p style="margin:0 0 10px 0;">Dear ${esc(args.employee.name)},</p>
        <p style="margin:0 0 10px 0;">Please find attached a letter about your ${esc(stageLabel)} on ${esc(values.meeting_when)}. Please read it carefully.</p>
        <p style="margin:0 0 14px 0;">Please let us know whether you can attend.</p>
        ${teamsNote}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:12px;background:#f59e0b;">
            <a href="${respondBase}?intent=accept" style="display:inline-block;padding:11px 20px;font-size:13px;font-weight:700;color:#081231;text-decoration:none;border-radius:12px;">Accept the invitation</a>
          </td>
          <td style="padding-left:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;border:1px solid rgba(255,255,255,0.35);">
              <a href="${respondBase}?intent=decline" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:700;color:#e8ecf6;text-decoration:none;border-radius:12px;">I cannot attend</a>
            </td></tr></table>
          </td>
        </tr></table>
        <p style="margin:12px 0 0 0;font-size:12px;color:#a8b2cc;">If you cannot attend you will be asked for the reason, and the meeting organiser will be told.</p>`,
    },
    {
      key: "conductor",
      profileId: args.conductor.id,
      name: args.conductor.name,
      email: args.conductor.email,
      eventTitle:
        renderLetterSubject(conductorLetter.subject, values) ||
        `${meetingNameAsTitle(extras.meetingName)} with ${args.employee.name} (Stage ${args.stage})`,
      hideCta: false,
      detailHtml: `
        ${rearrangedNote}
        ${renderLetterHtml(conductorLetter.body, { ...values, recipient_name: args.conductor.name })}
        <p style="margin:0 0 10px 0;">A copy of the letter ${esc(args.employee.name)} was sent is attached.</p>
        ${teamsNote}`,
    },
  ];
  return { letters, invitation, logoDataUrl: extras.logoDataUrl };
}

/** The attached letter as simple HTML, for the approval preview only. */
function invitationPreviewHtml(l: InvitationLetter): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const p = (t: string, extra = "") => `<p style="margin:0 0 8px 0;${extra}">${esc(t)}</p>`;
  return `
    <div style="margin:18px 0 0 0;padding:20px;background:#ffffff;color:#111827;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;">
      <p style="margin:0 0 12px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">The attached letter (PDF)</p>
      <div style="text-align:right;font-size:12px;">${[...l.letterheadLines, ...l.phoneLines].map(esc).join("<br/>")}</div>
      ${p(l.date, "text-align:right;margin-top:10px;")}
      ${p(l.recipientLines.join("\n")).replace(/\n/g, "<br/>")}
      ${p(l.salutation)}
      ${p(l.reLine, "font-weight:700;")}
      ${l.opening.map((t) => p(t)).join("")}
      ${p(l.details.map((d) => `${d.label}: ${d.value}`).join("\n")).replace(/\n/g, "<br/>")}
      ${p(l.absenceIntro)}
      <ul style="margin:0 0 8px 18px;padding:0;">${l.absenceLines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${l.closing.map((t) => p(t)).join("")}
      ${p([l.signOff.closing, "", l.signOff.name, l.signOff.role ?? ""].join("\n")).replace(/\n/g, "<br/>")}
    </div>`;
}

/** The approval preview of the pair: full branded emails, nothing sent or logged. */
async function previewMeetingLetters(args: MeetingLetterArgs): Promise<LetterPreview[]> {
  const { letters, invitation } = await buildMeetingLetters(args);
  const letterHtml = invitationPreviewHtml(invitation);
  return letters.map((l) => {
    const { subject, html } = renderCalendarInvite({
      companyName: args.companyName,
      recipient: { name: l.name },
      eventTitle: l.eventTitle,
      dateIso: args.meetingDate,
      timeHHMM: args.timeHHMM,
      durationMinutes: args.duration,
      hideCta: l.hideCta,
      detailHtml: l.detailHtml,
    });
    return {
      key: l.key,
      who: l.key === "employee" ? "Employee" : "Holding the meeting",
      name: l.name,
      to: l.email,
      subject,
      html: l.email ? `${html}${letterHtml}` : "",
      note: l.email ? "A calendar invite and the letter as a PDF are attached." : null,
    };
  });
}

type MeetingLettersSent = {
  outcomes: Record<string, string>;
  /** Null when the letter PDF could not be made; the emails still went, without it. */
  copyNote: string | null;
};

/** Sends the pair with the letter PDF attached, then keeps the employee's letter as a copy in their
 *  Evidence history (0406). Dedupe keys carry the slot, so a rearranged meeting sends fresh
 *  letters while the same slot can never double send. Not exported: internal to this file. */
async function sendMeetingLetters(
  args: MeetingLetterArgs,
  sentBy: { id: string; name: string | null },
): Promise<MeetingLettersSent> {
  const outcomes: Record<string, string> = {};
  const slot = `${args.meetingDate}:${args.timeHHMM}`;
  const { letters, invitation, logoDataUrl } = await buildMeetingLetters(args);

  let pdf: Buffer | null = null;
  let pdfError: string | null = null;
  try {
    pdf = await renderInvitationLetterPdf({ letter: invitation, logoDataUrl });
  } catch (e) {
    pdfError = (e as Error).message;
    console.error("[absence] invitation letter PDF failed", { meetingId: args.meetingId, error: pdfError });
  }
  const fileName = `${invitation.reLine.replace(/^RE:\s*/, "").replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, "-") || "Invitation"}.pdf`;

  for (const letter of letters) {
    if (!letter.email) {
      outcomes[letter.key] = "skipped_no_email";
      continue;
    }
    const result = await sendCalendarInvite({
      companyId: args.companyId,
      branchId: args.branchId,
      companyName: args.companyName,
      kind: "absence_meeting_invite",
      dedupeKey: `absence_meeting:${args.meetingId}:${slot}:${letter.email}`,
      recipient: { profileId: letter.profileId, name: letter.name, email: letter.email },
      eventTitle: letter.eventTitle,
      dateIso: args.meetingDate,
      timeHHMM: args.timeHHMM,
      durationMinutes: args.duration,
      location: args.location,
      hideCta: letter.hideCta,
      detailHtml: letter.detailHtml,
      icsUid: `absence-meeting-${args.meetingId}-${slot.replace(/[^0-9]/g, "")}-${letter.key}@becarecompliant.com`,
      extraAttachments: pdf
        ? [{ filename: fileName, content: pdf.toString("base64"), contentType: "application/pdf" }]
        : [],
    });
    outcomes[letter.key] = result.sent
      ? "sent"
      : result.deduped
        ? "already_sent"
        : result.skippedReason
          ? "skipped_no_email_config"
          : `failed: ${result.error}`;
  }

  if (!pdf) {
    return { outcomes, copyNote: `The letter PDF could not be made (${pdfError}), so the emails went without it and no copy was kept.` };
  }
  // A deduped send (the same slot already went) has its copy already.
  if (outcomes.employee === "already_sent") return { outcomes, copyNote: null };
  const kept = await keepMeetingLetter({
    companyId: args.companyId,
    branchId: args.branchId,
    personId: args.personId,
    meetingId: args.meetingId,
    kind: args.rearranged ? "rearranged" : "invite",
    stage: args.stage,
    meetingDate: args.meetingDate,
    meetingTime: args.timeHHMM,
    subject: invitation.reLine.replace(/^RE:\s*/, ""),
    letterText: invitation.plainText,
    pdf,
    emailedTo: outcomes.employee === "sent" ? args.employee.email : null,
    sendOutcome: outcomes.employee ?? "skipped_no_email",
    sentBy,
  });
  return {
    outcomes,
    copyNote: kept.ok ? null : `The letter went, but its copy could not be kept: ${kept.error}.`,
  };
}

type RearrangePlan = BookingPlan & { meetingId: string; responseToken: string };

/** A rearrangement, checked, before anything is changed or sent. Shared by the preview and the
 *  rearrange itself (Phil, 2026-09-29). */
async function planRearrange(
  formData: FormData,
  companyId: string,
): Promise<RearrangePlan | { error: string }> {
  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return { error: "Missing meeting." };

  const meetingDate = isoOrNull(String(formData.get("meeting_date") ?? ""));
  if (!meetingDate) return { error: "Choose the meeting date." };
  const rawTime = String(formData.get("meeting_time") ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(rawTime)) return { error: "Choose the meeting time." };
  const rearrangedInstant = londonToUtc(meetingDate, rawTime);
  if (rearrangedInstant.getTime() - Date.now() < 48 * 60 * 60 * 1000) {
    return {
      error:
        "Formal meetings need at least 48 hours notice. Choose a date and time at least two full days from now.",
    };
  }
  const rawDuration = Number.parseInt(String(formData.get("duration") ?? ""), 10);
  const duration =
    Number.isFinite(rawDuration) && rawDuration >= 15 && rawDuration <= 480 ? rawDuration : 60;
  const locationChoice = String(formData.get("location_choice") ?? "").trim();
  if (!locationChoice) {
    return { error: "Choose where the meeting will be held." };
  }
  const conductedBy = String(formData.get("conducted_by") ?? "").trim();
  if (!conductedBy) return { error: "Choose who is holding the meeting." };

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, evidence_id, response_token")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.company_id !== companyId) {
    return { error: "That meeting could not be found." };
  }
  if (meeting.evidence_id) {
    return { error: "This meeting has already been recorded and cannot be rearranged." };
  }

  const resolved = await resolveMeetingLocation(supabase, companyId, locationChoice);
  if ("error" in resolved) return { error: resolved.error };

  const conductor = await resolveConductor(supabase, companyId, conductedBy);
  if ("error" in conductor) return conductor;

  const { data: person } = await supabase
    .from("people")
    .select("full_name, work_email, profile_id, branch_id")
    .eq("id", meeting.person_id as string)
    .maybeSingle();
  const employeeEmail = await employeeEmailFor(person);
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", companyId).maybeSingle();

  return {
    supabase,
    meetingId,
    responseToken: meeting.response_token as string,
    personId: meeting.person_id as string,
    companyId,
    branchId: (meeting.branch_id as string | null) ?? null,
    companyName: company?.name ?? "Be Care Compliant",
    stage: (meeting.stage as number | null) ?? 1,
    meetingDate,
    rawTime,
    duration,
    location: resolved.location,
    locationKind: resolved.locationKind,
    employee: {
      profileId: (person?.profile_id as string | null) ?? null,
      name: (person?.full_name as string | null) ?? "the employee",
      email: employeeEmail,
    },
    conductor,
  };
}

/** Shows the two replacement letters exactly as Rearrange would send them. Changes nothing. */
export async function previewRearrangeAbsenceMeeting(formData: FormData): Promise<LetterPreviewState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const plan = await planRearrange(formData, profile.company_id);
  if ("error" in plan) return { error: plan.error };
  return {
    letters: await previewMeetingLetters({
      ...letterArgsFrom(plan),
      meetingId: plan.meetingId,
      responseToken: plan.responseToken,
      rearranged: true,
    }),
  };
}

/** Rearrange a booked (not yet recorded) meeting in one step: new slot,
 *  location and conductor, response reset, fresh letters to both invitees
 *  marked "this replaces the earlier invitation". Same 48 hour notice rule.
 *  Runs on Approve and send, after the letters were shown. */
export async function rearrangeAbsenceMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const plan = await planRearrange(formData, profile.company_id);
  if ("error" in plan) return { error: plan.error };
  const { supabase, meetingId, meetingDate, rawTime, duration, location, conductor } = plan;

  const { error: updErr } = await supabase
    .from("absence_meetings")
    .update({
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      conducted_by: conductor.id,
      response: null,
      response_reason: null,
      responded_at: null,
    })
    .eq("id", meetingId)
    .is("evidence_id", null);
  if (updErr) return { error: `The meeting could not be rearranged: ${updErr.message}` };

  const sent = await sendMeetingLetters(
    {
      ...letterArgsFrom(plan),
      meetingId,
      responseToken: plan.responseToken,
      rearranged: true,
    },
    { id: user.id, name: profile.full_name || profile.email },
  );
  const inviteOutcomes = sent.outcomes;

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_rearranged",
    entityType: "person",
    entityId: plan.personId,
    summary: `Rearranged the absence meeting to ${ukDate(meetingDate)} at ${rawTime}`,
    metadata: {
      meeting_id: meetingId,
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      conducted_by: conductor.id,
      invites: inviteOutcomes,
      letter_copy: sent.copyNote ?? "kept",
    },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${plan.personId}`);
  const sentCount = Object.values(inviteOutcomes).filter((v) => v === "sent").length;
  const base =
    sentCount > 0
      ? `Meeting rearranged. ${sentCount === 1 ? "1 new invitation" : `${sentCount} new invitations`} sent.`
      : "Meeting rearranged. No invitations could be sent (check email addresses).";
  // Always ok: the meeting IS booked and the letters went, so the dialog must not invite a second
  // booking. A copy that could not be kept is said in the same message, never swallowed.
  return { ok: `${base} ${sent.copyNote ?? "A copy of the letter is in their Evidence history."}` };
}

type CancelNotice = {
  key: "employee" | "conductor";
  profileId: string | null;
  name: string;
  email: string | null;
  subject: string;
  html: string;
  preheader: string;
};

type CancelPlan = {
  supabase: ServerClient;
  meetingId: string;
  personId: string;
  branchId: string | null;
  stageLabel: string;
  when: string;
  notices: CancelNotice[];
};

/** A cancellation, checked, with its notices built, before anything is deleted or sent. Shared by
 *  the preview and the cancel itself (Phil, 2026-09-29). */
async function planCancel(formData: FormData, companyId: string): Promise<CancelPlan | { error: string }> {
  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return { error: "Missing meeting." };

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, evidence_id, conducted_by")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.company_id !== companyId) {
    return { error: "That meeting could not be found." };
  }
  if (meeting.evidence_id) {
    return { error: "This meeting has already been recorded and cannot be cancelled." };
  }

  const { data: person } = await supabase
    .from("people")
    .select("full_name, work_email, profile_id")
    .eq("id", meeting.person_id as string)
    .maybeSingle();
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", companyId).maybeSingle();
  // What the company calls these meetings (0408).
  const named = stageLabelFor(meeting.stage as number | null, await companyMeetingName(companyId));
  const stageLabel = named.charAt(0).toUpperCase() + named.slice(1);
  // Reaches the carer's cancellation LETTER via {{meeting_when}}, the email preheader and the
  // audit summary. It printed "2026-08-19" while their invitation a week earlier said 19/08/2026.
  const when = `${ukDate(meeting.meeting_date as string | null)}${meeting.meeting_time ? ` at ${String(meeting.meeting_time).slice(0, 5)}` : ""}`;

  const recipients: Omit<CancelNotice, "subject" | "html" | "preheader">[] = [];
  if (person) {
    recipients.push({
      key: "employee",
      profileId: (person.profile_id as string | null) ?? null,
      name: person.full_name as string,
      email: await employeeEmailFor(person),
    });
  }
  const hasAccount = (key: CancelNotice["key"]) => key === "conductor"; // employees have no app account: no Open button
  if (meeting.conducted_by) {
    // Definer path: without it the person due to hold the meeting was never told it was off.
    const conductor =
      (await profilesById([meeting.conducted_by as string])).get(meeting.conducted_by as string) ?? null;
    if (conductor) {
      recipients.push({
        key: "conductor",
        profileId: conductor.id,
        name: conductor.name,
        email: (conductor.email as string | null) ?? null,
      });
    }
  }

  // Cancellation wording is the company's too (Settings > Letters).
  const cancelLetter = await letterWordingFor(supabase, companyId, "absence_meeting_cancelled");
  // Every placeholder the Letters screen offers resolves, so none is ever sent as raw {{text}}.
  // The "could lead to" sentence is left blank: it has no place in a cancellation.
  const cancelStageAction = stageActionFor(
    await getAbsenceConfig(companyId),
    (meeting.stage as number | null) ?? null,
  );
  const cancelValues = (recipientName: string): Record<string, string> => ({
    stage_action: cancelStageAction ?? "",
    stage_action_sentence: "",
    recipient_name: recipientName,
    employee_name: (person?.full_name as string) ?? "",
    company_name: company?.name ?? "your company",
    stage: meeting.stage ? String(meeting.stage) : "",
    stage_label: stageLabel,
    conductor_name: "",
    meeting_date: String(meeting.meeting_date ?? ""),
    meeting_time: meeting.meeting_time ? String(meeting.meeting_time).slice(0, 5) : "",
    meeting_when: when,
    location: "",
    duration: "",
  });
  const preheader = `The ${stageLabel.toLowerCase()} on ${when} is cancelled.`;

  return {
    supabase,
    meetingId,
    personId: meeting.person_id as string,
    branchId: (meeting.branch_id as string | null) ?? null,
    stageLabel,
    when,
    notices: recipients.map((r) => ({
      ...r,
      preheader,
      subject:
        renderLetterSubject(cancelLetter.subject, cancelValues(r.name)) || `Cancelled: ${stageLabel}`,
      html: noticeEmailHtml({
        preheader,
        heading: "Meeting cancelled",
        bodyHtml: renderLetterHtml(cancelLetter.body, cancelValues(r.name)),
        ctaLabel: hasAccount(r.key) ? "Open Be Care Compliant" : undefined,
        ctaUrl: hasAccount(r.key) ? siteUrl() : undefined,
      }),
    })),
  };
}

/** Shows the cancellation notices exactly as Cancel would send them. Deletes and sends nothing. */
export async function previewCancelAbsenceMeeting(formData: FormData): Promise<LetterPreviewState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const plan = await planCancel(formData, profile.company_id);
  if ("error" in plan) return { error: plan.error };
  return {
    letters: plan.notices.map((n) => ({
      key: n.key,
      who: n.key === "employee" ? "Employee" : "Holding the meeting",
      name: n.name,
      to: n.email,
      subject: n.subject,
      html: n.email ? n.html : "",
      note: null,
    })),
  };
}

/** Cancel a booked (not yet recorded) absence meeting. Deletes the booking so
 *  it stops counting towards the meeting stage, and emails a cancellation
 *  notice to the employee and the conductor. Rebooking is simply booking again
 *  (fresh letters go out). DB enforced: only open bookings are deletable, by
 *  Admins or the branch Manager (policy in migration 0048). Runs on Approve
 *  and send, after the notices were shown. */
export async function cancelAbsenceMeetingBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const plan = await planCancel(formData, profile.company_id);
  if ("error" in plan) return { error: plan.error };
  const { supabase, meetingId } = plan;

  const { error: delErr, count } = await supabase
    .from("absence_meetings")
    .delete({ count: "exact" })
    .eq("id", meetingId)
    .is("evidence_id", null);
  if (delErr || !count) {
    return { error: delErr?.message ?? "You do not have permission to cancel this booking." };
  }

  // Cancellation notices to everyone who received a formal letter.
  const noticeOutcomes: Record<string, string> = {};
  for (const notice of plan.notices) {
    if (!notice.email) continue;
    const logId = await claimNotification({
      companyId: profile.company_id,
      branchId: plan.branchId,
      recipientProfileId: notice.profileId,
      channel: "email",
      kind: "meeting_cancelled",
      dedupeKey: `meeting_cancelled:${meetingId}:${notice.email}`,
      toAddress: notice.email,
      subject: notice.subject,
    });
    if (!logId) continue;
    const result = await sendEmail({ companyId: profile.company_id, to: notice.email, subject: notice.subject, html: notice.html });
    noticeOutcomes[notice.email] = result.sent
      ? "sent"
      : result.skippedReason
        ? "skipped_no_email_config"
        : `failed: ${result.error}`;
    await settleNotification(
      logId,
      result.sent ? "sent" : result.skippedReason ? "skipped" : "failed",
      result.error ?? result.skippedReason,
    );
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_cancelled",
    entityType: "person",
    entityId: plan.personId,
    summary: `Cancelled the ${plan.stageLabel.toLowerCase()} booked for ${plan.when}`,
    metadata: { meeting_id: meetingId, notices: noticeOutcomes },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${plan.personId}`);
  return { ok: "Booking cancelled. The invitees have been told." };
}

/** A copy of the invitation for a meeting booked before copies were kept (0406, Phil 2026-10-06:
 *  Sarah Harris's Stage 2 invitation went with nothing kept). Rebuilt from the booking details and
 *  the same wording, dated the day it was booked, and marked on the PDF as made afterwards. Only
 *  for a meeting still waiting to be held that has no copy yet. Sends nothing. */
export async function keepMissingInvitationCopy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return { error: "Missing meeting." };

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, duration_minutes, location, conducted_by, booked_by, response_token, evidence_id, created_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (!m || m.company_id !== profile.company_id) return { error: "That meeting could not be found." };
  if (!m.stage || !m.meeting_date || !m.meeting_time || !m.conducted_by) {
    return { error: "This meeting was not booked with a letter, so there is nothing to copy." };
  }
  const { data: allowed } = await supabase.rpc("can_prepare_absence_meeting", { p_person_id: m.person_id });
  if (allowed !== true) return { error: "You do not have permission to do this." };

  const { data: existing } = await supabase
    .from("absence_meeting_letters")
    .select("id")
    .eq("meeting_id", meetingId)
    .limit(1);
  if (existing && existing.length > 0) return { error: "This meeting already has a copy of its letter." };

  const { data: person } = await supabase
    .from("people")
    .select("full_name, work_email, profile_id, branch_id")
    .eq("id", m.person_id as string)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };
  const conductor = (await profilesById([m.conducted_by as string])).get(m.conducted_by as string);
  if (!conductor) return { error: "Who was holding the meeting could not be found." };
  const { data: company } = await supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle();
  const employeeEmail = await employeeEmailFor(person);
  const location = String(m.location ?? "");
  const bookedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(m.created_at as string));

  const args: MeetingLetterArgs = {
    supabase,
    personId: m.person_id as string,
    meetingId,
    responseToken: String(m.response_token ?? ""),
    companyId: profile.company_id,
    branchId: (m.branch_id as string | null) ?? null,
    companyName: company?.name ?? "Be Care Compliant",
    stage: m.stage as number,
    meetingDate: m.meeting_date as string,
    timeHHMM: String(m.meeting_time).slice(0, 5),
    duration: (m.duration_minutes as number | null) ?? 60,
    location,
    locationKind: location === "Microsoft Teams" ? "teams" : "office",
    employee: { profileId: (person.profile_id as string | null) ?? null, name: person.full_name as string, email: employeeEmail },
    conductor: { id: conductor.id as string, name: conductor.name, email: (conductor.email as string | null) ?? null },
    rearranged: false,
    letterDateIso: bookedOn,
  };
  const { invitation, logoDataUrl } = await buildMeetingLetters(args);
  let pdf: Buffer;
  try {
    pdf = await renderInvitationLetterPdf({ letter: invitation, logoDataUrl, notice: REBUILT_NOTICE });
  } catch (e) {
    return { error: `The letter PDF could not be made: ${(e as Error).message}` };
  }
  const kept = await keepMeetingLetter({
    companyId: profile.company_id,
    branchId: args.branchId,
    personId: args.personId,
    meetingId,
    kind: "invite",
    stage: args.stage,
    meetingDate: args.meetingDate,
    meetingTime: args.timeHHMM,
    subject: invitation.reLine.replace(/^RE:\s*/, ""),
    letterText: invitation.plainText,
    pdf,
    emailedTo: employeeEmail,
    sendOutcome: "sent before copies were kept",
    sentBy: { id: user.id, name: profile.full_name || profile.email },
    rebuilt: true,
  });
  if (!kept.ok) return { error: `The copy could not be kept: ${kept.error}.` };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_letter_copied",
    entityType: "person",
    entityId: args.personId,
    summary: `Made a copy of the Stage ${args.stage} invitation letter sent before copies were kept`,
    metadata: { meeting_id: meetingId, letter_id: kept.id },
  });
  revalidatePath(`/people/${args.personId}`);
  return { ok: "A copy of the letter is now in their Evidence history." };
}

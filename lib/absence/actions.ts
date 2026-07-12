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
import { writeAudit } from "@/lib/audit";
import { sendCalendarInvite } from "@/lib/notifications/invites";
import { sendEmail } from "@/lib/email/resend";
import { escapeHtml, noticeEmailHtml } from "@/lib/email/templates";
import { claimNotification, settleNotification } from "@/lib/notifications/log";
import { londonToUtc } from "@/lib/email/ics";
import { siteUrl } from "@/lib/site";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getCompanyFormByKey } from "@/lib/people/data";

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
    summary: `Recorded an absence from ${startDate}${endDate ? ` to ${endDate}` : ""}`,
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
    summary: `Updated an absence last date to ${endDate ?? "(cleared)"}`,
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

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

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
    .order("meeting_date", { ascending: false })
    .limit(1);
  if (validStage) bookingQuery = bookingQuery.eq("stage", validStage);
  const { data: openBooking } = await bookingQuery.maybeSingle();

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
  return { ok: attachedToBooking ? "Meeting recorded against the booking." : "Meeting recorded." };
}

/** Book a formal absence management meeting (Stage 1 to 4) for a future date.
 *  Creates the meeting entry (no Evidence yet: that comes when it is recorded)
 *  and sends the employee and their line manager a FORMAL LETTER invitation
 *  with a timed .ics calendar invite. Booked meetings count towards the
 *  person's meeting stage (Phil, 2026-07-12). Emails silently no-op when
 *  Resend is missing; outcomes are audited. Editable letter templates are a
 *  Phase 10 Additions item; the wording here is the standard letter. */
export async function bookAbsenceMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

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
  const locationKind = String(formData.get("location_kind") ?? "");
  if (locationKind !== "office" && locationKind !== "teams") {
    return { error: "Choose where the meeting will be held: Office or Teams." };
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

  // Office prints the FULL branch address in the letters (Phil, 2026-07-12).
  let location = "Microsoft Teams";
  if (locationKind === "office") {
    const { data: branch } = await supabase
      .from("branches")
      .select("address")
      .eq("id", person.branch_id as string)
      .maybeSingle();
    if (!branch?.address) {
      return { error: "Set this branch's office address in Settings, Branches first, then book the meeting." };
    }
    location = branch.address as string;
  }

  // Stage gate (Phil, 2026-07-12): a stage that has already been held or
  // booked cannot be booked again; the next stage (or a repeat Stage 4) is
  // the only option. A "no further action" outcome resetting the cycle
  // arrives with the meeting outcomes feature (Additions).
  const { data: maxStageRow } = await supabase
    .from("absence_meetings")
    .select("stage")
    .eq("person_id", personId)
    .not("stage", "is", null)
    .order("stage", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxStage = (maxStageRow?.stage as number | null) ?? 0;
  if (stage <= maxStage && !(stage === 4 && maxStage === 4)) {
    return {
      error: `Stage ${stage} has already been held or booked for this person. Book Stage ${Math.min(maxStage + 1, 4)} instead.`,
    };
  }

  // The conductor must be an active Manager or Admin in THIS company.
  const { data: conductor } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, company_id, status")
    .eq("id", conductedBy)
    .maybeSingle();
  if (
    !conductor ||
    conductor.company_id !== person.company_id ||
    conductor.status !== "active" ||
    !["company_admin", "manager"].includes(conductor.role as string)
  ) {
    return { error: "The meeting must be held by a Manager or Admin in your company." };
  }

  const { data: meeting, error: insErr } = await supabase
    .from("absence_meetings")
    .insert({
      company_id: person.company_id as string,
      branch_id: (person.branch_id as string | null) ?? null,
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
  let employeeEmail = (person.work_email as string | null) ?? null;
  if (!employeeEmail && person.profile_id) {
    const { data: p } = await supabase
      .from("profiles").select("email").eq("id", person.profile_id).maybeSingle();
    employeeEmail = p?.email ?? null;
  }
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", person.company_id as string).maybeSingle();

  const inviteOutcomes = await sendMeetingLetters({
    meetingId: meeting.id as string,
    responseToken: meeting.response_token as string,
    companyId: person.company_id as string,
    branchId: (person.branch_id as string | null) ?? null,
    companyName: company?.name ?? "Be Care Compliant",
    stage,
    meetingDate,
    timeHHMM: rawTime,
    duration,
    location,
    locationKind,
    employee: {
      profileId: (person.profile_id as string | null) ?? null,
      name: person.full_name as string,
      email: employeeEmail,
    },
    conductor: {
      id: conductor.id as string,
      name: (conductor.full_name || conductor.email) as string,
      email: (conductor.email as string | null) ?? null,
    },
    rearranged: false,
  });

  await writeAudit({
    companyId: person.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_booked",
    entityType: "person",
    entityId: personId,
    summary: `Booked a Stage ${stage} absence meeting for ${meetingDate} at ${rawTime}`,
    metadata: {
      meeting_id: meeting.id,
      stage,
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      conducted_by: conductor.id,
      invites: inviteOutcomes,
    },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${personId}`);
  const sentCount = Object.values(inviteOutcomes).filter((v) => v === "sent").length;
  return {
    ok:
      sentCount > 0
        ? `Meeting booked. ${sentCount === 1 ? "1 invitation" : `${sentCount} invitations`} sent.`
        : "Meeting booked. No invitations could be sent (check email addresses).",
  };
}

/** The formal letter pair for a booked or rearranged meeting: the employee's
 *  invitation (purpose, conductor, right to be accompanied, location, Accept /
 *  I cannot attend buttons) and the conductor's chairing copy (unambiguous
 *  that THEY are holding it, not attending one: Phil, 2026-07-12). Dedupe keys
 *  carry the slot, so a rearranged meeting sends fresh letters while the same
 *  slot can never double-send. Not exported: internal to this file. */
async function sendMeetingLetters(args: {
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
}): Promise<Record<string, string>> {
  const outcomes: Record<string, string> = {};
  const stageLabel = `Stage ${args.stage} absence management meeting`;
  const slot = `${args.meetingDate}:${args.timeHHMM}`;
  const employeeName = escapeHtml(args.employee.name);
  const locationSentence =
    args.locationKind === "teams"
      ? `held over <strong style="color:#ffffff;">Microsoft Teams</strong>. A Teams invite will follow shortly`
      : `held at <strong style="color:#ffffff;">${escapeHtml(args.location)}</strong>`;
  const rearrangedNote = args.rearranged
    ? `<p style="margin:0 0 10px 0;color:#fcd34d;">This meeting has been rearranged. This invitation replaces the earlier one, please update your calendar.</p>`
    : "";

  const sends: {
    key: string;
    profileId: string | null;
    name: string;
    email: string;
    eventTitle: string;
    detailHtml: string;
    hideCta: boolean;
  }[] = [];

  if (args.employee.email) {
    const respondBase = `${siteUrl()}/meeting-response/${args.responseToken}`;
    sends.push({
      key: "employee",
      profileId: args.employee.profileId,
      name: args.employee.name,
      email: args.employee.email,
      eventTitle: stageLabel,
      hideCta: true, // employees have no app account: no Open button
      detailHtml: `
        ${rearrangedNote}
        <p style="margin:0 0 10px 0;">This is your formal invitation to a <strong style="color:#ffffff;">${stageLabel}</strong> under the absence procedure at ${escapeHtml(args.companyName)}.</p>
        <p style="margin:0 0 10px 0;">The purpose of the meeting is to review your absence record, discuss any support you may need, and consider the next steps under the procedure. The meeting will be conducted by ${escapeHtml(args.conductor.name)} and ${locationSentence}.</p>
        <p style="margin:0 0 14px 0;">You have the right to be accompanied by a colleague or a trade union representative. Please let us know in advance if you will be accompanied.</p>
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
    });
  } else {
    outcomes.employee = "skipped_no_email";
  }

  if (args.conductor.email) {
    sends.push({
      key: "conductor",
      profileId: args.conductor.id,
      name: args.conductor.name,
      email: args.conductor.email,
      eventTitle: `Absence meeting with ${args.employee.name} (Stage ${args.stage})`,
      hideCta: false,
      detailHtml: `
        ${rearrangedNote}
        <p style="margin:0 0 10px 0;">You are chairing this meeting: a <strong style="color:#ffffff;">${stageLabel}</strong> for <strong style="color:#ffffff;">${employeeName}</strong>, ${locationSentence}. This is about ${employeeName}'s absence record, not your own.</p>
        <p style="margin:0;">Their absence record is on the Absence page. Once the meeting has taken place, record it there so the Evidence attaches to this booking. You will be emailed when ${employeeName} accepts or declines.</p>`,
    });
  } else {
    outcomes.conductor = "skipped_no_email";
  }

  for (const send of sends) {
    const result = await sendCalendarInvite({
      companyId: args.companyId,
      branchId: args.branchId,
      companyName: args.companyName,
      kind: "absence_meeting_invite",
      dedupeKey: `absence_meeting:${args.meetingId}:${slot}:${send.email}`,
      recipient: { profileId: send.profileId, name: send.name, email: send.email },
      eventTitle: send.eventTitle,
      dateIso: args.meetingDate,
      timeHHMM: args.timeHHMM,
      durationMinutes: args.duration,
      location: args.location,
      hideCta: send.hideCta,
      detailHtml: send.detailHtml,
      icsUid: `absence-meeting-${args.meetingId}-${slot.replace(/[^0-9]/g, "")}-${send.key}@becarecompliant.com`,
    });
    outcomes[send.key] = result.sent
      ? "sent"
      : result.deduped
        ? "already_sent"
        : result.skippedReason
          ? "skipped_no_email_config"
          : `failed: ${result.error}`;
  }
  return outcomes;
}

/** Rearrange a booked (not yet recorded) meeting in one step: new slot,
 *  location and conductor, response reset, fresh letters to both invitees
 *  marked "this replaces the earlier invitation". Same 48 hour notice rule. */
export async function rearrangeAbsenceMeeting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
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
  const locationKind = String(formData.get("location_kind") ?? "");
  if (locationKind !== "office" && locationKind !== "teams") {
    return { error: "Choose where the meeting will be held: Office or Teams." };
  }
  const conductedBy = String(formData.get("conducted_by") ?? "").trim();
  if (!conductedBy) return { error: "Choose who is holding the meeting." };

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, evidence_id, response_token")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.company_id !== profile.company_id) {
    return { error: "That meeting could not be found." };
  }
  if (meeting.evidence_id) {
    return { error: "This meeting has already been recorded and cannot be rearranged." };
  }

  let location = "Microsoft Teams";
  if (locationKind === "office") {
    const { data: branch } = await supabase
      .from("branches")
      .select("address")
      .eq("id", meeting.branch_id as string)
      .maybeSingle();
    if (!branch?.address) {
      return { error: "Set this branch's office address in Settings, Branches first, then rearrange the meeting." };
    }
    location = branch.address as string;
  }

  const { data: conductor } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, company_id, status")
    .eq("id", conductedBy)
    .maybeSingle();
  if (
    !conductor ||
    conductor.company_id !== profile.company_id ||
    conductor.status !== "active" ||
    !["company_admin", "manager"].includes(conductor.role as string)
  ) {
    return { error: "The meeting must be held by a Manager or Admin in your company." };
  }

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

  const { data: person } = await supabase
    .from("people")
    .select("full_name, work_email, profile_id, branch_id")
    .eq("id", meeting.person_id as string)
    .maybeSingle();
  let employeeEmail = (person?.work_email as string | null) ?? null;
  if (!employeeEmail && person?.profile_id) {
    const { data: p } = await supabase
      .from("profiles").select("email").eq("id", person.profile_id).maybeSingle();
    employeeEmail = p?.email ?? null;
  }
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", profile.company_id).maybeSingle();

  const inviteOutcomes = await sendMeetingLetters({
    meetingId,
    responseToken: meeting.response_token as string,
    companyId: profile.company_id,
    branchId: (meeting.branch_id as string | null) ?? null,
    companyName: company?.name ?? "Be Care Compliant",
    stage: (meeting.stage as number | null) ?? 1,
    meetingDate,
    timeHHMM: rawTime,
    duration,
    location,
    locationKind,
    employee: {
      profileId: (person?.profile_id as string | null) ?? null,
      name: (person?.full_name as string | null) ?? "the employee",
      email: employeeEmail,
    },
    conductor: {
      id: conductor.id as string,
      name: (conductor.full_name || conductor.email) as string,
      email: (conductor.email as string | null) ?? null,
    },
    rearranged: true,
  });

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.meeting_rearranged",
    entityType: "person",
    entityId: meeting.person_id as string,
    summary: `Rearranged the absence meeting to ${meetingDate} at ${rawTime}`,
    metadata: {
      meeting_id: meetingId,
      meeting_date: meetingDate,
      meeting_time: rawTime,
      duration_minutes: duration,
      location,
      conducted_by: conductor.id,
      invites: inviteOutcomes,
    },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${meeting.person_id}`);
  const sentCount = Object.values(inviteOutcomes).filter((v) => v === "sent").length;
  return {
    ok:
      sentCount > 0
        ? `Meeting rearranged. ${sentCount === 1 ? "1 new invitation" : `${sentCount} new invitations`} sent.`
        : "Meeting rearranged. No invitations could be sent (check email addresses).",
  };
}

/** Cancel a booked (not yet recorded) absence meeting. Deletes the booking so
 *  it stops counting towards the meeting stage, and emails a cancellation
 *  notice to the employee and the conductor. Rebooking is simply booking again
 *  (fresh letters go out). DB enforced: only open bookings are deletable, by
 *  Admins or the branch Manager (policy in migration 0048). */
export async function cancelAbsenceMeetingBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return { error: "Missing meeting." };

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, evidence_id, conducted_by")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting || meeting.company_id !== profile.company_id) {
    return { error: "That meeting could not be found." };
  }
  if (meeting.evidence_id) {
    return { error: "This meeting has already been recorded and cannot be cancelled." };
  }

  const { error: delErr, count } = await supabase
    .from("absence_meetings")
    .delete({ count: "exact" })
    .eq("id", meetingId)
    .is("evidence_id", null);
  if (delErr || !count) {
    return { error: delErr?.message ?? "You do not have permission to cancel this booking." };
  }

  // Cancellation notices to everyone who received a formal letter.
  const { data: person } = await supabase
    .from("people")
    .select("full_name, work_email, profile_id")
    .eq("id", meeting.person_id as string)
    .maybeSingle();
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", profile.company_id).maybeSingle();
  const stageLabel = meeting.stage
    ? `Stage ${meeting.stage} absence management meeting`
    : "Absence management meeting";
  const when = `${meeting.meeting_date ?? ""}${meeting.meeting_time ? ` at ${String(meeting.meeting_time).slice(0, 5)}` : ""}`;

  const notices: { profileId: string | null; name: string; email: string; hasAccount: boolean }[] = [];
  let employeeEmail = (person?.work_email as string | null) ?? null;
  if (!employeeEmail && person?.profile_id) {
    const { data: p } = await supabase
      .from("profiles").select("email").eq("id", person.profile_id).maybeSingle();
    employeeEmail = p?.email ?? null;
  }
  if (person && employeeEmail) {
    notices.push({
      profileId: (person.profile_id as string | null) ?? null,
      name: person.full_name as string,
      email: employeeEmail,
      hasAccount: false, // employees have no app account: no Open button
    });
  }
  if (meeting.conducted_by) {
    const { data: conductor } = await supabase
      .from("profiles").select("id, full_name, email").eq("id", meeting.conducted_by).maybeSingle();
    if (conductor?.email) {
      notices.push({
        profileId: conductor.id,
        name: conductor.full_name || conductor.email,
        email: conductor.email,
        hasAccount: true,
      });
    }
  }

  const noticeOutcomes: Record<string, string> = {};
  for (const notice of notices) {
    const logId = await claimNotification({
      companyId: profile.company_id,
      branchId: (meeting.branch_id as string | null) ?? null,
      recipientProfileId: notice.profileId,
      channel: "email",
      kind: "meeting_cancelled",
      dedupeKey: `meeting_cancelled:${meetingId}:${notice.email}`,
      toAddress: notice.email,
      subject: `Cancelled: ${stageLabel}`,
    });
    if (!logId) continue;
    const result = await sendEmail({
      to: notice.email,
      subject: `Cancelled: ${stageLabel}`,
      html: noticeEmailHtml({
        preheader: `The ${stageLabel.toLowerCase()} on ${when} is cancelled.`,
        heading: "Meeting cancelled",
        bodyHtml: `<p style="margin:0;">${escapeHtml(notice.name)}, the <strong style="color:#ffffff;">${stageLabel}</strong> booked for <strong style="color:#ffffff;">${escapeHtml(when)}</strong> at ${escapeHtml(company?.name ?? "your company")} has been cancelled. Please remove it from your calendar. If it is rearranged you will receive a new invitation.</p>`,
        ctaLabel: notice.hasAccount ? "Open Be Care Compliant" : undefined,
        ctaUrl: notice.hasAccount ? siteUrl() : undefined,
      }),
    });
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
    entityId: meeting.person_id as string,
    summary: `Cancelled the ${stageLabel.toLowerCase()} booked for ${when}`,
    metadata: { meeting_id: meetingId, notices: noticeOutcomes },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${meeting.person_id}`);
  return { ok: "Booking cancelled. The invitees have been told." };
}

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
import { escapeHtml } from "@/lib/email/templates";
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
  const conductedBy = String(formData.get("conducted_by") ?? "").trim();
  if (!conductedBy) return { error: "Choose who is holding the meeting." };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("branch_id, company_id, full_name, work_email, profile_id, manager_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That record could not be found." };

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
      booked_by: user.id,
      conducted_by: conductor.id,
    })
    .select("id, response_token")
    .single();
  if (insErr || !meeting) {
    return { error: `The meeting could not be booked: ${insErr?.message ?? "no id returned"}` };
  }

  // Formal letter invitations: employee + line manager.
  const inviteOutcomes: Record<string, string> = {};
  const stageLabel = `Stage ${stage} absence management meeting`;

  let employeeEmail = (person.work_email as string | null) ?? null;
  if (!employeeEmail && person.profile_id) {
    const { data: p } = await supabase
      .from("profiles").select("email").eq("id", person.profile_id).maybeSingle();
    employeeEmail = p?.email ?? null;
  }
  const { data: company } = await supabase
    .from("companies").select("name").eq("id", person.company_id as string).maybeSingle();
  const companyName = company?.name ?? "Be Care Compliant";
  const managerName = conductor.full_name || conductor.email;
  const employeeName = escapeHtml(String(person.full_name));

  const recipients: {
    key: string;
    profileId: string | null;
    name: string;
    email: string;
    detailHtml: string;
  }[] = [];
  if (employeeEmail) {
    const respondBase = `${siteUrl()}/meeting-response/${meeting.response_token}`;
    recipients.push({
      key: "employee",
      profileId: (person.profile_id as string | null) ?? null,
      name: person.full_name as string,
      email: employeeEmail,
      detailHtml: `
        <p style="margin:0 0 10px 0;">This is your formal invitation to a <strong style="color:#ffffff;">${stageLabel}</strong> under the absence procedure at ${escapeHtml(companyName)}.</p>
        <p style="margin:0 0 10px 0;">The purpose of the meeting is to review your absence record, discuss any support you may need, and consider the next steps under the procedure. The meeting will be conducted by ${escapeHtml(managerName)}.</p>
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
    inviteOutcomes.employee = "skipped_no_email";
  }
  if (conductor.email) {
    recipients.push({
      key: "conductor",
      profileId: conductor.id,
      name: conductor.full_name || conductor.email,
      email: conductor.email,
      detailHtml: `
        <p style="margin:0 0 10px 0;">You are booked to conduct a <strong style="color:#ffffff;">${stageLabel}</strong> with <strong style="color:#ffffff;">${employeeName}</strong> under the absence procedure at ${escapeHtml(companyName)}.</p>
        <p style="margin:0;">Their absence record is on the Absence page. Once the meeting has taken place, record it there so the Evidence attaches to this booking. You will be emailed when ${employeeName} accepts or declines.</p>`,
    });
  } else {
    inviteOutcomes.conductor = "skipped_no_email";
  }

  for (const recipient of recipients) {
    const inviteResult = await sendCalendarInvite({
      companyId: person.company_id as string,
      branchId: (person.branch_id as string | null) ?? null,
      companyName,
      kind: "absence_meeting_invite",
      dedupeKey: `absence_meeting:${meeting.id}:${recipient.email}`,
      recipient: {
        profileId: recipient.profileId,
        name: recipient.name,
        email: recipient.email,
      },
      eventTitle: stageLabel,
      dateIso: meetingDate,
      timeHHMM: rawTime,
      durationMinutes: duration,
      detailHtml: recipient.detailHtml,
      icsUid: `absence-meeting-${meeting.id}-${recipient.key}@becarecompliant.com`,
    });
    inviteOutcomes[recipient.key] = inviteResult.sent
      ? "sent"
      : inviteResult.deduped
        ? "already_sent"
        : inviteResult.skippedReason
          ? "skipped_no_email_config"
          : `failed: ${inviteResult.error}`;
  }

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

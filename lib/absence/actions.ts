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

  const { data: meeting, error: insErr } = await supabase
    .from("absence_meetings")
    .insert({
      company_id: person.company_id as string,
      branch_id: (person.branch_id as string | null) ?? null,
      person_id: personId,
      stage: stage && stage >= 1 && stage <= 4 ? stage : null,
      meeting_date: meetingDate,
      evidence_id: result.evidenceId,
      recorded_by: user.id,
    })
    .select("id")
    .single();
  if (insErr || !meeting) {
    return { error: `Evidence was saved, but the meeting could not be logged: ${insErr?.message ?? "no id returned"}` };
  }

  // Meeting invitations (Phase 6): when the meeting date is today or in the
  // future, invite the employee and their manager with an .ics calendar
  // attachment. A meeting logged retrospectively sends nothing. Emails no-op
  // silently when Resend is not configured; the outcome is audited.
  const inviteOutcomes: Record<string, string> = {};
  const todayLondon = formatCivilDate(todayInLondon());
  if (meetingDate && meetingDate >= todayLondon) {
    const stageLabel = stage ? `Stage ${stage} absence meeting` : "Absence meeting";
    const recipients: { key: string; profileId: string | null; name: string; email: string }[] = [];

    let employeeEmail = (person.work_email as string | null) ?? null;
    if (!employeeEmail && person.profile_id) {
      const { data: p } = await supabase
        .from("profiles").select("email").eq("id", person.profile_id).maybeSingle();
      employeeEmail = p?.email ?? null;
    }
    if (employeeEmail) {
      recipients.push({
        key: "employee",
        profileId: (person.profile_id as string | null) ?? null,
        name: person.full_name as string,
        email: employeeEmail,
      });
    } else {
      inviteOutcomes.employee = "skipped_no_email";
    }

    if (person.manager_id) {
      const { data: manager } = await supabase
        .from("profiles").select("id, full_name, email").eq("id", person.manager_id).maybeSingle();
      if (manager?.email) {
        recipients.push({
          key: "manager",
          profileId: manager.id,
          name: manager.full_name || manager.email,
          email: manager.email,
        });
      } else {
        inviteOutcomes.manager = "skipped_no_email";
      }
    }

    const { data: company } = await supabase
      .from("companies").select("name").eq("id", person.company_id as string).maybeSingle();

    for (const recipient of recipients) {
      const inviteResult = await sendCalendarInvite({
        companyId: person.company_id as string,
        branchId: (person.branch_id as string | null) ?? null,
        companyName: company?.name ?? "Be Care Compliant",
        kind: "absence_meeting_invite",
        dedupeKey: `absence_meeting:${meeting.id}:${recipient.email}`,
        recipient: {
          profileId: recipient.profileId,
          name: recipient.name,
          email: recipient.email,
        },
        eventTitle: stageLabel,
        dateIso: meetingDate,
        detailHtml: `<p style="margin:0;">This is a formal absence management meeting regarding <strong style="color:#ffffff;">${escapeHtml(String(person.full_name))}</strong>. Please attend on the date shown.</p>`,
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
    metadata: { evidence_id: result.evidenceId, stage, meeting_id: meeting.id, invites: inviteOutcomes },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${personId}`);
  return { ok: "Meeting recorded." };
}

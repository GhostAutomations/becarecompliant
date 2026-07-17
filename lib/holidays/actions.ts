"use server";

/**
 * Be Care Compliant — Holiday server actions.
 *
 *   requestHoliday : anyone submits their own request (Holiday Form -> Evidence)
 *                    and a pending holiday_requests row is created.
 *   decideHoliday  : a Manager/Admin approves or declines (Holiday Response ->
 *                    Evidence), then decide_holiday_request stamps the outcome.
 * No balance/entitlement tracking (approve/deny only); the email flow is Phase 6.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getCompanyFormByKey } from "@/lib/people/data";
import { notifyHolidayRequested, notifyHolidayDecided } from "@/lib/notifications/holiday";

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
    .select("id, branch_id")
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

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId,
    answers,
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
    summary: `Requested holiday ${startDate} to ${endDate}`,
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

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: personId,
  });
  if (!result.ok) return { error: result.error };

  // Branch Manager and above book directly (approved); a Supervisor's booking is
  // logged as pending until a Branch Manager or higher approves it.
  const canApproveOwn = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"].includes(
    profile.role,
  );
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
    summary: `Booked holiday for ${person.full_name} from ${startDate} to ${endDate}`,
    metadata: { evidence_id: result.evidenceId, start_date: startDate, end_date: endDate },
  });

  revalidatePath("/people/holiday");
  return { ok: canApproveOwn ? "Holiday booked." : "Holiday booked, pending approval." };
}

/** Approve or decline a holiday request (Manager/Admin) via the Holiday Response form. */
export async function decideHoliday(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "Missing request." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const approval = String(answers["approval"] ?? "").toLowerCase();
  const status =
    approval.includes("approve") ? "approved" : approval.includes("decline") ? "declined" : null;
  if (!status) return { error: "Choose whether to approve or decline the request." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("holiday_requests")
    .select("company_id, branch_id, person_id, requested_by, start_date, end_date")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "That request could not be found." };

  const form = await getCompanyFormByKey(request.company_id as string, "holiday_response");
  if (!form) {
    return { error: "The Holiday Response form is not available for your company yet." };
  }

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (request.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: request.person_id ? "person" : null,
    recordId: (request.person_id as string | null) ?? null,
  });
  if (!result.ok) return { error: result.error };

  const note = typeof answers["decline_reason"] === "string" ? (answers["decline_reason"] as string) : null;
  const { error: decErr } = await supabase.rpc("decide_holiday_request", {
    p_id: requestId,
    p_status: status,
    p_evidence_id: result.evidenceId,
    p_note: note,
  });
  if (decErr) {
    return { error: `Evidence was saved, but the decision could not be recorded: ${decErr.message}` };
  }

  // Phase 6: tell the requester the outcome. Best-effort, idempotent, silently
  // skipped when Resend is not configured.
  const requesterEmail = await notifyHolidayDecided({
    companyId: request.company_id as string,
    branchId: (request.branch_id as string | null) ?? null,
    requestId,
    requestedBy: (request.requested_by as string | null) ?? null,
    status,
    startDate: request.start_date as string,
    endDate: request.end_date as string,
    note,
  });

  await writeAudit({
    companyId: request.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "holiday.decided",
    entityType: "holiday_request",
    entityId: requestId,
    summary: `Holiday request ${status}`,
    metadata: { evidence_id: result.evidenceId, status, requester_email: requesterEmail },
  });

  revalidatePath("/people/holiday");
  return { ok: "Decision saved." };
}

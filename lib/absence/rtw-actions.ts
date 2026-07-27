"use server";

/**
 * Return to Work: drafting one with AI, and recording it as Evidence.
 *
 * The draft is a convenience, never a substitute for the conversation. It fills the
 * "Prepared for you" section (a summary of the absence and questions worth asking) from
 * the absence record, and the manager edits everything before completing. Nothing is
 * stored until they complete the form, so a draft they dislike costs one AI credit and
 * leaves no trace on the employee's file.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { runAi } from "@/lib/ai/anthropic";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { getCompanyFormByKey } from "@/lib/people/data";
import { getRtwContext } from "./rtw";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";

const RTW_SYSTEM = [
  "You are helping a UK care sector manager prepare for a Return to Work interview.",
  "Return to Work interviews are held after every absence. Your job is to prepare, not to decide.",
  "Write in plain British English. No dashes. Never diagnose, never speculate about a medical cause,",
  "and never suggest disciplinary action or an outcome: that is the manager's judgement after talking",
  "to the person. Be warm and practical. Assume the employee may be anxious about returning.",
  "Reply as exactly two sections, using these headings on their own lines and nothing else:",
  "SUMMARY",
  "QUESTIONS",
  "Under SUMMARY write two or three sentences of factual context from the record.",
  "Under QUESTIONS write four to six short questions, one per line, no numbering or bullets.",
].join(" ");

function splitDraft(text: string): { summary: string; questions: string } {
  const qIndex = text.search(/^\s*QUESTIONS\s*$/im);
  const sIndex = text.search(/^\s*SUMMARY\s*$/im);
  if (qIndex === -1) return { summary: text.trim(), questions: "" };
  const summary = text
    .slice(sIndex === -1 ? 0 : sIndex, qIndex)
    .replace(/^\s*SUMMARY\s*$/im, "")
    .trim();
  const questions = text
    .slice(qIndex)
    .replace(/^\s*QUESTIONS\s*$/im, "")
    .trim();
  return { summary, questions };
}

/** Draft the Prepared for you section. Costs one AI credit; the credit is refunded by
 *  runAi if the call fails, so a failure never charges them. */
export async function draftReturnToWork(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const absenceId = String(formData.get("absence_event_id") ?? "");
  if (!absenceId) return { error: "Missing absence." };

  const ctx = await getRtwContext(absenceId);
  if (!ctx) return { error: "That absence could not be found." };

  const history = ctx.recent.length
    ? ctx.recent
        .map((r) => `- ${r.start_date} to ${r.end_date ?? "open"}, ${r.days ?? "unknown"} days, reason: ${r.reason ?? "not given"}`)
        .join("\n")
    : "- none recorded";

  const prompt = [
    `Employee: ${ctx.personName}`,
    `This absence: ${ctx.startDate} to ${ctx.endDate ?? "not ended"}${ctx.returnDate ? `, returned ${ctx.returnDate}` : ""}`,
    `Working days lost: ${ctx.days ?? "not recorded"}`,
    `Reason given: ${ctx.reason ?? "not recorded"}`,
    "",
    "Their other absences on record:",
    history,
  ].join("\n");

  const result = await runAi({
    companyId: profile.company_id,
    feature: "return_to_work",
    prompt,
    system: RTW_SYSTEM,
    maxTokens: 900,
  });
  if ("error" in result) return { error: result.error };

  const { summary, questions } = splitDraft(result.ok);
  return {
    ok: "Drafted",
    // The page reads these back into the form fields for the manager to edit.
    data: { absence_summary: summary, suggested_questions: questions },
  } as ActionState;
}

/** Record the completed interview as Evidence and close the Return to Work off. */
export async function recordReturnToWork(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const absenceId = String(formData.get("absence_event_id") ?? "");
  if (!absenceId) return { error: "Missing absence." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: absence } = await supabase
    .from("absence_events")
    .select("id, person_id, branch_id, rtw_evidence_id")
    .eq("id", absenceId)
    .maybeSingle();
  if (!absence) return { error: "That absence could not be found." };
  if (absence.rtw_evidence_id) {
    return { error: "A Return to Work has already been recorded for this absence." };
  }

  const form = await getCompanyFormByKey(profile.company_id, "return_to_work");
  if (!form) return { error: "The Return to Work form is not available for your company yet." };

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

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (absence.branch_id as string | null) ?? null,
    answers,
    files,
    recordType: "person",
    recordId: absence.person_id as string,
  });
  if (!result.ok) return { error: result.error };

  // Check the update landed: an RLS refusal returns no rows and no error, which would
  // otherwise leave the Return to Work showing as still outstanding forever.
  const { data: updated, error: updErr } = await supabase
    .from("absence_events")
    .update({ rtw_evidence_id: result.evidenceId })
    .eq("id", absenceId)
    .is("rtw_evidence_id", null)
    .select("id");
  if (updErr || !updated || updated.length === 0) {
    return { error: "The interview was saved as Evidence but the absence could not be updated." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence.return_to_work_recorded",
    entityType: "person",
    entityId: absence.person_id as string,
    summary: "Recorded a Return to Work interview",
    metadata: { absence_event_id: absenceId, evidence_id: result.evidenceId },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${absence.person_id}`);
  return { ok: "Recorded", redirectTo: `/people/absence` };
}

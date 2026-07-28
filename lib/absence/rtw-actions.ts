"use server";

/**
 * Return to Work: drafting one with AI, and recording it as Evidence.
 *
 * The draft is a convenience, never a substitute for the conversation. It fills the
 * "Prepared for you" section (a summary of the absence, and anything worth raising that
 * is specific to THIS absence) from the absence record, and the manager edits everything
 * before completing. The standard Return to Work questions are real fields on the form
 * itself (migration 0145), so the draft adds to them and never replaces them. Nothing is
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

// The form now asks the standard Return to Work questions as real fields of its own
// (doctor seen, fit note, medication, appointments, anything at work making it worse,
// what support would help), so the draft must ADD to them rather than replace them:
// a second list of the same questions in a text box is noise the manager has to read
// past. ALSO ASK is therefore whatever is specific to THIS absence and nothing else.
const RTW_SYSTEM = [
  "You are helping a UK care sector manager prepare for a Return to Work interview.",
  "Return to Work interviews are held after every absence. Your job is to prepare, not to decide.",
  "Write in plain British English. No dashes. Never diagnose, never speculate about a medical cause,",
  "and never suggest disciplinary action or an outcome: that is the manager's judgement after talking",
  "to the person. Be warm and practical. Assume the employee may be anxious about returning.",
  "The form already asks, as its own questions: whether they have seen a doctor, whether a fit note",
  "was provided, whether any medication is likely to affect their work or their driving, any",
  "outstanding medical appointments, whether anything at work is making it worse, what support would",
  "help, whether they are fit to return, and whether the absence was work related.",
  "Never repeat any of those. Your job is only what is specific to THIS absence.",
  "Reply as exactly two sections, using these headings on their own lines and nothing else:",
  "SUMMARY",
  "ALSO ASK",
  "Under SUMMARY write two or three sentences of factual context from the record.",
  "Under ALSO ASK write at most three short points the manager should raise because of this",
  "particular record, for example a pattern of short absences or an absence that followed an",
  "earlier one. One per line, no numbering or bullets. If nothing stands out, write",
  "Nothing specific to raise beyond the standard questions.",
].join(" ");

const ALSO_ASK_RE = /^\s*ALSO[ _]?ASK\s*:?\s*$/im;
const SUMMARY_RE = /^\s*SUMMARY\s*:?\s*$/im;

function splitDraft(text: string): { summary: string; alsoAsk: string } {
  const qIndex = text.search(ALSO_ASK_RE);
  const sIndex = text.search(SUMMARY_RE);
  if (qIndex === -1) return { summary: text.trim(), alsoAsk: "" };
  const summary = text
    .slice(sIndex === -1 ? 0 : sIndex, qIndex)
    .replace(SUMMARY_RE, "")
    .trim();
  const alsoAsk = text.slice(qIndex).replace(ALSO_ASK_RE, "").trim();
  return { summary, alsoAsk };
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

  const { summary, alsoAsk } = splitDraft(result.ok);
  return {
    ok: "Drafted",
    // The page reads these back into the form fields for the manager to edit. The keys
    // MUST match the Return to Work schema (migration 0145).
    data: { absence_summary: summary, extra_questions: alsoAsk },
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

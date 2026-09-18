"use server";

/**
 * Be Care Compliant — reporting an incident, investigating it, and answering it.
 *
 * WHY THIS EXISTS (Phil, 2026-09-18). An incident used to be TYPED INTO a record by somebody
 * at the branch, which meant it was written up by somebody who was not there, from what they
 * were told on the phone. Thistle's staff filled in a 123FormBuilder form instead, because a
 * carer cannot reach the Incidents module at all. So the account and the record were two
 * different documents in two different systems.
 *
 * The case now starts with a FORM. Whoever saw it fills it in -- a carer from the team portal
 * included -- and filing it opens the case and stamps the record from the answers. After that
 * it runs like a complaint: an Investigation, then an Outcome, both Evidence, both with AI
 * assist. An investigation that finds nothing further to do finishes the case there
 * (lib/incidents/stages.ts).
 *
 * ONE SOURCE OF TRUTH. The record holds the spine -- branch, date, category, description,
 * status -- because the register, the dashboard and the Reg 80 aggregate all read it. The
 * Evidence holds the account, frozen against the schema version it was filed under. The record
 * is stamped FROM the Evidence and never typed alongside it.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence } from "@/lib/evidence/submit";
import { getCompanyFormByKey } from "@/lib/people/data";
import { runAi } from "@/lib/ai/anthropic";
import { stripJsonFence, toAiQuestions, type ActionState } from "@/lib/forms";
import type { Answers } from "@/lib/form-schema";
import { todayIso } from "./logic";

export const INCIDENT_REPORT_FORM = "incident_report";
export const INCIDENT_INVESTIGATION_FORM = "incident_investigation";
export const INCIDENT_OUTCOME_FORM = "incident_outcome";

function str(answers: Answers, key: string): string | null {
  const v = answers[key];
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function isoDate(answers: Answers, key: string): string | null {
  const s = str(answers, key);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function hhmm(answers: Answers, key: string): string | null {
  const s = str(answers, key);
  return s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

function yes(answers: Answers, key: string): boolean | null {
  const v = answers[key];
  if (typeof v === "boolean") return v;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "yes" || s === "true") return true;
  if (s === "no" || s === "false") return false;
  return null;
}

function readAnswers(formData: FormData): Answers | null {
  try {
    return JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return null;
  }
}

/**
 * File an incident report. Opens the case.
 *
 * Available to ANY member of the company, which is the point of the change: the person who saw
 * it writes it down. The branch is chosen on the form and checked against this company here;
 * RLS (incidents_insert, 0301) enforces the same thing again.
 */
export async function submitIncidentReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const answers = readAnswers(formData);
  if (!answers) return { error: "Could not read the form answers." };

  const branchId = str(answers, "branch");
  if (!branchId) return { error: "Choose the branch this happened in." };

  const supabase = await createClient();
  /* THE BRANCH IS CHECKED, not trusted. It arrives as an id in a form post, and a form post is
     the one place an id from another company can turn up. */
  const { data: branch } = await supabase
    .from("branches")
    .select("id, company_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch || branch.company_id !== companyId) return { error: "That branch was not found." };

  const occurredOn = isoDate(answers, "occurred_on");
  const category = str(answers, "category");
  const description = str(answers, "description");
  if (!occurredOn) return { error: "Enter the date it happened." };
  if (!category) return { error: "Choose what kind of event it was." };
  if (!description) return { error: "Describe what happened." };

  const form = await getCompanyFormByKey(companyId, INCIDENT_REPORT_FORM);
  if (!form) return { error: "The incident report form is not available. Import the latest templates from Settings." };

  const { data: incident, error } = await supabase
    .from("incidents")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      occurred_on: occurredOn,
      occurred_at: hhmm(answers, "occurred_at"),
      category,
      description,
      reported_on: todayIso(),
      status: "open",
      created_by: user.id,
    })
    .select("id, ref_number")
    .single();
  if (error || !incident) return { error: error?.message ?? "The incident could not be opened." };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId,
    answers,
    recordType: "incident",
    recordId: incident.id as string,
  });
  /* A CASE WITH NO ACCOUNT ON IT IS WORSE THAN NO CASE. If the Evidence will not store, the
     case goes with it rather than sitting in the register as a category and a date. */
  if (!result.ok) {
    await supabase.from("incidents").delete().eq("id", incident.id);
    return { error: result.error };
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "incident.reported",
    entityType: "incident",
    entityId: incident.id as string,
    summary: `Reported an incident: ${category}`,
    metadata: { evidence_id: result.evidenceId, ref_number: incident.ref_number },
  });

  revalidatePath("/incidents");
  revalidatePath("/my");
  return { ok: "Reported.", redirectTo: `/incidents/${incident.id}` };
}

/**
 * File the Investigation or the Outcome against an open case.
 *
 * Each stamps its own date on the record once -- first one wins, the same `.is(col, null)`
 * guard the complaint investigation uses -- and the Investigation also writes the answer that
 * decides whether an Outcome is wanted at all.
 */
export async function submitIncidentEvidence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const incidentId = String(formData.get("incident_id") ?? "").trim();
  const formKey = String(formData.get("form_key") ?? "").trim();
  if (!incidentId || !formKey) return { error: "Missing incident or form." };
  if (formKey !== INCIDENT_INVESTIGATION_FORM && formKey !== INCIDENT_OUTCOME_FORM) {
    return { error: "That form does not belong to an incident." };
  }

  const answers = readAnswers(formData);
  if (!answers) return { error: "Could not read the form answers." };

  const supabase = await createClient();
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, branch_id, status")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) return { error: "That incident could not be found." };

  const form = await getCompanyFormByKey(companyId, formKey);
  if (!form) return { error: "That form is not available. Import the latest templates from Settings." };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (incident.branch_id as string | null) ?? null,
    answers,
    recordType: "incident",
    recordId: incidentId,
  });
  if (!result.ok) return { error: result.error };

  const stamp = { updated_by: user.id, updated_at: new Date().toISOString() };

  if (formKey === INCIDENT_INVESTIGATION_FORM) {
    /* "Is further action required?" NO means no further action, which is the early exit. The
       column is named for the exit rather than the question so that reading the record says
       what happened rather than what was asked. */
    const further = yes(answers, "further_action_required");
    await supabase
      .from("incidents")
      .update({ investigation_completed: todayIso(), no_further_action: further === null ? null : !further, ...stamp })
      .eq("id", incidentId)
      .is("investigation_completed", null);
    if (incident.status === "open") {
      await supabase.from("incidents").update({ status: "under_review", ...stamp }).eq("id", incidentId);
    }
  } else {
    await supabase
      .from("incidents")
      .update({
        outcome_recorded_on: todayIso(),
        outcome: str(answers, "finding"),
        recommendations: str(answers, "recommendations"),
        lessons_learnt: str(answers, "lessons_learnt"),
        ...stamp,
      })
      .eq("id", incidentId)
      .is("outcome_recorded_on", null);
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: formKey === INCIDENT_INVESTIGATION_FORM ? "incident.investigated" : "incident.outcome_recorded",
    entityType: "incident",
    entityId: incidentId,
    summary: formKey === INCIDENT_INVESTIGATION_FORM ? "Filed the investigation" : "Recorded the outcome",
    metadata: { evidence_id: result.evidenceId, form_key: formKey },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  // No redirectTo: the shared FormEvidenceDialog closes itself and refreshes. A redirectTo
  // leaves it open on "Saving..." for ever (see submitComplaintEvidence).
  return { ok: "Saved." };
}

// ===========================================================================
// AI assist
// ===========================================================================

/** What the model is told about the job, for both drafts. Written once so the two cannot
 *  drift into two different ideas of what an incident investigation is for. */
const INCIDENT_SYSTEM = [
  "You help a UK domiciliary care provider investigate an incident.",
  "You are not deciding anything. You are helping a manager who was not there to find out what happened.",
  "Be specific to THIS incident. Generic questions and generic findings are worse than none,",
  "because somebody has to read past them to get to the real ones.",
  "Use plain British English. No jargon, no American spelling, no bullet symbols other than a hyphen.",
  "Never name a disciplinary outcome, an HR process or a sanction. Whether anybody is at fault is",
  "not yours to say and is not what an investigation record is for.",
].join(" ");

type ReportContext = {
  refNumber: number | null;
  category: string;
  occurredOn: string;
  description: string;
  answers: Answers;
};

/** The report, as the model needs to see it: the record's spine plus the account that was filed. */
async function getReportContext(incidentId: string): Promise<ReportContext | null> {
  const supabase = await createClient();
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, ref_number, category, occurred_on, description")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) return null;
  const { data: ev } = await supabase
    .from("evidence")
    .select("answers, submitted_at, form_id, forms(key)")
    .eq("record_type", "incident")
    .eq("record_id", incidentId)
    .order("submitted_at", { ascending: true });
  const rows = (ev as Array<{ answers: Answers; forms: { key: string } | { key: string }[] | null }> | null) ?? [];
  const keyOf = (r: (typeof rows)[number]) => {
    const f = Array.isArray(r.forms) ? r.forms[0] : r.forms;
    return f?.key ?? "";
  };
  const report = rows.find((r) => keyOf(r) === INCIDENT_REPORT_FORM);
  return {
    refNumber: (incident.ref_number as number | null) ?? null,
    category: (incident.category as string) ?? "",
    occurredOn: (incident.occurred_on as string) ?? "",
    description: (incident.description as string) ?? "",
    answers: report?.answers ?? {},
  };
}

/** The report written out as lines the model can read, skipping what was not answered. */
function describeReport(ctx: ReportContext): string {
  const a = ctx.answers;
  const line = (label: string, key: string) => {
    const v = a[key];
    const s = typeof v === "string" ? v.trim() : typeof v === "boolean" ? (v ? "yes" : "no") : "";
    return s ? `${label}: ${s}` : null;
  };
  return [
    `Category: ${ctx.category}`,
    `Date: ${ctx.occurredOn}`,
    line("Type of event", "event_type"),
    line("Where", "location"),
    `What was reported: ${ctx.description}`,
    line("Service user involved", "service_user_name"),
    line("Staff member involved", "staff_name"),
    line("Others involved", "others_involved"),
    line("Potential harm", "potential_harm"),
    line("Actual harm", "actual_harm"),
    line("Injury or ill health", "injuries_detail"),
    line("Treatment", "treatment_detail"),
    line("Why no treatment", "treatment_none_reason"),
    line("Reported to the office on", "reported_on"),
    line("Next of kin told", "next_of_kin"),
    line("Why next of kin not told", "next_of_kin_why_not"),
    line("Unusual about the environment", "environment_detail"),
    line("How the service arrangements played a part", "arrangements_detail"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Draft the lines of enquiry for this incident. One AI credit; runAi refunds it on failure.
 *
 * QUESTIONS, NOT A NARRATIVE (Phil chose this). A summary written from the report alone is a
 * conclusion drawn from one person's account before anybody has looked into it. Questions turn
 * a blank box into an investigation and leave the answering to the person doing it.
 */
export async function draftIncidentQuestions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const incidentId = String(formData.get("incident_id") ?? "").trim();
  if (!incidentId) return { error: "Missing incident." };

  const ctx = await getReportContext(incidentId);
  if (!ctx) return { error: "That incident could not be found." };

  const prompt = [
    "Here is an incident as it was reported.",
    "",
    describeReport(ctx),
    "",
    "Write the lines of enquiry a manager should work through to establish what happened and why.",
    "Ask only what this report leaves genuinely open. Where the report already answers something, do not ask it again.",
    "At least one question must be about whether anything in the way the service is arranged made this more likely.",
    'Return ONLY valid JSON: {"questions":[{"label":"...","type":"text"}]}.',
    'type is "text", "yes_no" or "choice"; a "choice" question also carries "options":["..."].',
    "At most 8 questions.",
  ].join("\n");

  const result = await runAi({
    companyId: profile.company_id,
    feature: "incident_investigation",
    prompt,
    system: INCIDENT_SYSTEM,
    maxTokens: 1600,
  });
  if ("error" in result) return { error: result.error };

  let questions: ReturnType<typeof toAiQuestions> = [];
  try {
    const parsed = JSON.parse(stripJsonFence(result.ok)) as unknown;
    questions = Array.isArray(parsed)
      ? toAiQuestions(parsed)
      : toAiQuestions((parsed as { questions?: unknown } | null)?.questions);
  } catch {
    questions = [];
  }
  if (questions.length === 0) {
    /* Nothing usable as JSON. The prose still helps, so it goes into the field rather than
       being thrown away with an error: a draft to tidy up beats no draft. */
    return { ok: "Drafted", data: { lines_of_enquiry: result.ok.trim() } } as ActionState;
  }
  return {
    ok: "Drafted",
    // lines_of_enquiry is a real field; ai_questions is not. The dialog pulls the second out,
    // renders a control per question, and writes the answers into the first on save.
    data: { ai_questions: JSON.stringify(questions) },
  } as ActionState;
}

/**
 * Draft the outcome and the recommendations from the report AND the investigation.
 *
 * CONFIDENTIALITY, the same guard the complaint response carries: an outcome record can end up
 * in front of a family, a council or an inspector, so nothing about anybody's discipline goes
 * in it. That decision is asked separately on the form and stays inside the company.
 */
export async function draftIncidentOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const incidentId = String(formData.get("incident_id") ?? "").trim();
  if (!incidentId) return { error: "Missing incident." };

  const ctx = await getReportContext(incidentId);
  if (!ctx) return { error: "That incident could not be found." };

  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("evidence")
    .select("answers, submitted_at, forms(key)")
    .eq("record_type", "incident")
    .eq("record_id", incidentId)
    .order("submitted_at", { ascending: false });
  const rows = (ev as Array<{ answers: Answers; forms: { key: string } | { key: string }[] | null }> | null) ?? [];
  const investigation = rows.find((r) => {
    const f = Array.isArray(r.forms) ? r.forms[0] : r.forms;
    return f?.key === INCIDENT_INVESTIGATION_FORM;
  });
  if (!investigation) return { error: "Complete the Incident Investigation first." };

  const inv = investigation.answers;
  const prompt = [
    "Here is an incident as it was reported.",
    "",
    describeReport(ctx),
    "",
    "Here is what the investigation established.",
    "",
    `Lines of enquiry and answers: ${String(inv.lines_of_enquiry ?? "none recorded")}`,
    `Findings: ${String(inv.findings ?? "none recorded")}`,
    "",
    "Write the company's outcome.",
    "The finding says what the company concludes happened and why, from what is above and nothing else.",
    "The recommendations say what should change so it is less likely to happen again: training, risk",
    "assessment, equipment, instructions, supervision, rotas. Each one specific enough to act on.",
    "Say nothing about disciplinary action, conduct proceedings or any individual being at fault.",
    'Return ONLY valid JSON: {"finding":"...","recommendations":"...","lessons_learnt":"..."}.',
    "lessons_learnt is one or two sentences for the quarterly return.",
  ].join("\n");

  const result = await runAi({
    companyId: profile.company_id,
    feature: "incident_outcome",
    prompt,
    system: INCIDENT_SYSTEM,
    maxTokens: 2000,
  });
  if ("error" in result) return { error: result.error };

  try {
    const parsed = JSON.parse(stripJsonFence(result.ok)) as Record<string, unknown>;
    const pick = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string).trim() : "");
    const finding = pick("finding");
    const recommendations = pick("recommendations");
    if (finding || recommendations) {
      return {
        ok: "Drafted",
        data: { finding, recommendations, lessons_learnt: pick("lessons_learnt") },
      } as ActionState;
    }
  } catch {
    // fall through
  }
  // Unparseable: give them the prose in the finding rather than nothing, and let them cut it up.
  return { ok: "Drafted", data: { finding: result.ok.trim() } } as ActionState;
}

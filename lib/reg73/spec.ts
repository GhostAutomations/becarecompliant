/**
 * Be Care Compliant — Regulation 73 (RI branch visit) field spec.
 * ONE definition of the report's sections and fields, so the fillable form and the
 * PDF stay in step. `buildInitialData` turns the pulled site data (Reg73Prefill)
 * into the pre-filled starting values the RI then edits. No dashes in copy.
 *
 * PLAN, DO AND REVIEW. The paper form this replaces states that it is modelled on the
 * plan, do and review cycle, and every review question on it carries three follow up
 * boxes: what is the plan, who needs to do what and by when, and when should it be
 * reviewed and by whom. Those boxes are the only place the report records what will
 * actually happen about a No, so they are asked here too, directly beneath the question
 * they belong to. They are deliberately NOT AI fields: who does what by when is a
 * management decision, not something to draft.
 *
 * NOTHING THAT ATTESTS TO WORK IS PRE-FILLED. buildInitialData fills only what the site
 * genuinely knows: names, dates, figures, and what the last visit recorded. Every Yes/No
 * starts unanswered, because a question such as "has the RI undertaken a random review of
 * service user files" is a statement the RI signs their name to, and the software must
 * not answer it on their behalf.
 */

import type { Reg73Prefill } from "@/lib/reg73/prefill";

export type Reg73FieldType = "yesno" | "text" | "date" | "signature" | "checkbox";

export type Reg73Field = {
  key: string;
  label: string;
  type: Reg73FieldType;
  /** This narrative box can be drafted by AI from the pulled data. */
  ai?: boolean;
  /** Small helper under the field. */
  hint?: string;
};

export type Reg73Section = { title: string; intro?: string; fields: Reg73Field[] };

/** The follow up boxes the plan, do and review cycle asks for, for one review area. */
function planDoReview(prefix: string, subject: string, opts?: { plan?: boolean }): Reg73Field[] {
  const fields: Reg73Field[] = [];
  if (opts?.plan !== false) {
    fields.push({
      key: `${prefix}_plan`,
      label: `Plan: what is the plan of action to ensure ${subject}?`,
      type: "text",
    });
  }
  fields.push({
    key: `${prefix}_do`,
    label: `Do: who needs to do what to ensure ${subject}, and when should this be done by?`,
    type: "text",
  });
  fields.push({
    key: `${prefix}_review`,
    label: "Review: when should these actions be reviewed to confirm they have been achieved, and who should review them?",
    type: "text",
  });
  return fields;
}

const PDR_INTRO =
  "This visit follows the plan, do and review cycle. Where the answer is No, record the plan, who needs to do what and by when, and when it will be reviewed and by whom.";

export const REG73_SECTIONS: Reg73Section[] = [
  {
    title: "The visit",
    fields: [
      { key: "ri_name", label: "Name of the RI undertaking the branch visit", type: "text" },
      { key: "start_date", label: "Start date of the branch visit", type: "date" },
      { key: "end_date", label: "End date of the branch visit", type: "date" },
    ],
  },
  {
    title: "Previous visit",
    fields: [
      { key: "prev_actions_identified", label: "Did the previous RI visit identify any actions to be undertaken?", type: "yesno" },
      {
        key: "prev_actions_status",
        label: "Summary of the current status of actions identified within the last RI visit",
        type: "text",
        hint: "Pre-filled with what the last visit recorded and where those figures stand today.",
      },
    ],
  },
  {
    title: "Staffing structure",
    intro: PDR_INTRO,
    fields: [
      {
        key: "staffing_structure_ok",
        label: "Is the branch structure in line with the company structure in the statement of purpose?",
        type: "yesno",
      },
      ...planDoReview("staffing_structure", "the structure of the branch reflects the company structure in the statement of purpose"),
    ],
  },
  {
    title: "Access to key information",
    fields: [
      {
        key: "key_info_access_ok",
        label:
          "Does the branch have access to policies, procedures, staff and service user records, statement of purpose, service user guide and staff handbook?",
        type: "yesno",
      },
      ...planDoReview("key_info", "the branch has access to the organisation's policies and procedures"),
    ],
  },
  {
    title: "Systems",
    fields: [
      {
        key: "review_systems_ok",
        label: "Is the branch meeting the KPI target system for new care package assessments and care plan reviews?",
        type: "yesno",
      },
      ...planDoReview("systems", "the branch achieves its targets for new care package assessments and care plan reviews"),
    ],
  },
  {
    title: "KPI dashboard",
    fields: [
      {
        key: "kpi_dashboard",
        label: "KPI dashboard performance",
        type: "text",
        hint: "Pre-filled from the site. Overdue counts, PQS rates and complaints for this branch.",
      },
      { key: "plan", label: "Plan: what is the plan of action to ensure the branch achieves its KPI targets?", type: "text", ai: true },
    ],
  },
  {
    title: "Staff feedback",
    intro: "Feedback from staff on the quality of care and how it can be improved.",
    fields: [
      { key: "staff_feedback_quality", label: "What feedback have staff given on the quality of care and how it can be improved?", type: "text", ai: true },
      { key: "staff_feedback_outcomes", label: "Do staff believe the care they deliver achieves the personal outcomes of service users, delivered respectfully?", type: "text", ai: true },
      { key: "staff_feedback_other", label: "Other feedback staff have provided", type: "text" },
      { key: "staff_feedback_actions", label: "Following feedback, what actions are required and who is responsible?", type: "text" },
      { key: "staff_feedback_review", label: "When should these actions be reviewed, and who should review them?", type: "text" },
    ],
  },
  {
    title: "Service user feedback",
    intro: "Feedback from service users on whether care is delivered consistently and reliably.",
    fields: [
      { key: "su_feedback_consistent", label: "What feedback have service users given on whether the service is delivered consistently and reliably?", type: "text", ai: true },
      { key: "su_feedback_outcomes", label: "Do service users believe their care achieves their personal outcomes, delivered respectfully, by caring staff?", type: "text", ai: true },
      { key: "su_feedback_other", label: "Other feedback service users have provided", type: "text" },
      { key: "su_feedback_actions", label: "Following feedback, what actions are required and who is responsible?", type: "text" },
      { key: "su_feedback_review", label: "When should these actions be reviewed, and who should review them?", type: "text" },
    ],
  },
  {
    title: "Workforce development",
    fields: [
      { key: "staffing_kpi_ok", label: "Is the branch meeting the KPI target system for workforce development?", type: "yesno" },
      ...planDoReview("workforce", "the branch achieves the KPI targets set for its workforce development"),
    ],
  },
  {
    title: "Premises",
    fields: [
      {
        key: "premises_ok",
        label:
          "Are the branch premises well organised and displaying regulatory and insurance documents, statement of purpose and service user guides?",
        type: "yesno",
      },
      ...planDoReview(
        "premises",
        "the branch is well organised and displaying its regulatory and insurance documents, statement of purpose and service user guides",
        { plan: false },
      ),
    ],
  },
  {
    title: "Records reviewed",
    fields: [
      { key: "su_files_reviewed", label: "Has the RI undertaken a random review of service user files?", type: "yesno" },
      { key: "su_files_findings", label: "Findings following review of service user files", type: "text" },
      { key: "su_files_actions", label: "Actions required following review of service user files", type: "text" },
      { key: "safeguarding_file_reviewed", label: "Has the RI reviewed the Safeguarding Referrals and Regulatory Notifications file?", type: "yesno" },
      { key: "safeguarding_findings", label: "Findings following review of the Safeguarding Referrals and Regulatory Notifications file", type: "text" },
      { key: "safeguarding_actions", label: "Actions required following review of the Safeguarding Referrals and Regulatory Notifications file", type: "text" },
    ],
  },
  {
    title: "Branch feedback and follow up",
    fields: [
      { key: "branch_feedback", label: "Does the branch manager have any feedback they wish to discuss?", type: "text" },
      { key: "followup_arranged", label: "Has the RI arranged a follow up branch visit?", type: "yesno" },
      { key: "followup_date", label: "Date of the RI next branch visit", type: "date" },
      { key: "quality_audit_arranged", label: "Has the RI arranged a quality audit meeting with the company director?", type: "yesno" },
      { key: "quality_audit_date", label: "Date of the next quality audit meeting", type: "date" },
    ],
  },
  {
    title: "Sign off",
    fields: [{ key: "ri_signature", label: "Responsible Individual signature", type: "signature" }],
  },
];

export const REG73_AI_FIELDS = REG73_SECTIONS.flatMap((s) => s.fields.filter((f) => f.ai).map((f) => f.key));

/**
 * Every box where an RI records something that has to be done and then checked. Read on
 * the NEXT visit to answer "did the previous visit identify any actions, and where do they
 * stand", so the loop closes without anybody carrying it forward by hand.
 */
export const REG73_ACTION_FIELDS: { key: string; label: string }[] = [
  { key: "plan", label: "KPI plan" },
  { key: "staffing_structure_plan", label: "Staffing structure plan" },
  { key: "staffing_structure_do", label: "Staffing structure actions" },
  { key: "key_info_plan", label: "Access to key information plan" },
  { key: "key_info_do", label: "Access to key information actions" },
  { key: "systems_plan", label: "Systems plan" },
  { key: "systems_do", label: "Systems actions" },
  { key: "workforce_plan", label: "Workforce development plan" },
  { key: "workforce_do", label: "Workforce development actions" },
  { key: "premises_do", label: "Premises actions" },
  { key: "staff_feedback_actions", label: "Actions from staff feedback" },
  { key: "su_feedback_actions", label: "Actions from service user feedback" },
  { key: "su_files_actions", label: "Actions from the service user file review" },
  { key: "safeguarding_actions", label: "Actions from the safeguarding and notifications file review" },
];

function pctText(v: number | null): string {
  return v == null ? "no data" : `${v}%`;
}

/** A compact, factual data summary the RI reads and the AI drafts from. */
export function reg73DataSummary(p: Reg73Prefill): string {
  const overdue = p.overdueByCheck.length
    ? p.overdueByCheck.map((o) => `${o.checkName}: ${o.count} overdue`).join("; ")
    : "no overdue checks";
  const complaints = p.complaints.total
    ? `${p.complaints.total} complaint(s) in the last 3 months (${p.complaints.byType.map((t) => `${t.type}: ${t.count}`).join(", ")})`
    : "no complaints in the last 3 months";
  const roles = p.staffing.roles.length
    ? p.staffing.roles.map((r) => `${r.count} ${r.title}`).join(", ")
    : "no staff recorded";
  return [
    `Branch: ${p.branchName}.`,
    `Staffing: ${p.staffing.total} active staff (${roles}).`,
    `Overdue compliance: ${overdue}.`,
    `Mandatory training compliance ${pctText(p.pqs.mandatoryTraining)}, safeguarding training ${pctText(p.pqs.safeguarding)}, Social Care Wales registration ${pctText(p.pqs.scwRegistration)}.`,
    `Supervisions completed on time ${pctText(p.pqs.supervisionOnTime)}, care plan reviews on time ${pctText(p.pqs.carePlanReviewOnTime)}.`,
    `Customer satisfaction ${pctText(p.pqs.customerSatisfaction)}, personal outcomes achieving or progressing ${pctText(p.pqs.personalOutcomes)}.`,
    `Complaints: ${complaints}.`,
  ].join(" ");
}

/**
 * The pre-filled starting values for a new visit, from the pulled data.
 *
 * ONLY WHAT THE SITE KNOWS: names, dates, live figures, and what the previous visit
 * recorded. No Yes/No answer is pre-filled. Those are the RI's own attestations and the
 * RI signs the report, so the software must not answer them in advance.
 */
export function buildInitialData(p: Reg73Prefill, riName: string): Record<string, string> {
  const complaintsLine = p.complaints.total
    ? `Complaints in the last 3 months: ${p.complaints.total} (${p.complaints.byType.map((t) => `${t.type}: ${t.count}`).join(", ")}).`
    : "Complaints in the last 3 months: none recorded.";

  const kpiLines = [
    `Staff overdue spot checks at today's date: ${p.spotCheckOverdue}.`,
    `Staff overdue supervisions at today's date: ${p.supervisionOverdue}.`,
    `Mandatory training compliance: ${pctText(p.pqs.mandatoryTraining)}. Safeguarding training: ${pctText(p.pqs.safeguarding)}.`,
    `Supervisions on time: ${pctText(p.pqs.supervisionOnTime)}. Care plan reviews on time: ${pctText(p.pqs.carePlanReviewOnTime)}.`,
    `Social Care Wales registration: ${pctText(p.pqs.scwRegistration)}.`,
    complaintsLine,
  ];

  /*
   * The previous visit's own words, box by box, rather than only its KPI plan. This is what
   * "did the last visit identify any actions, and where do they stand" actually means, and
   * reading it off the last report is the only way it survives a change of RI.
   */
  const prevData = (p.previousVisit?.data ?? {}) as Record<string, unknown>;
  const prevActions = REG73_ACTION_FIELDS.map((f) => {
    const v = prevData[f.key];
    return typeof v === "string" && v.trim() ? `${f.label}: ${v.trim()}` : "";
  }).filter(Boolean);

  const prevStatus = p.previousVisit
    ? [
        `Previous visit${p.previousVisit.endDate ? ` ended ${p.previousVisit.endDate}` : ""}.`,
        prevActions.length ? prevActions.join("\n") : "The previous visit recorded no actions.",
        `Current position: ${p.spotCheckOverdue} spot checks and ${p.supervisionOverdue} supervisions overdue.`,
      ].join("\n")
    : "This is the first recorded Regulation 73 visit for this branch, so there are no previous actions to report on.";

  return {
    ri_name: riName,
    start_date: p.generatedAt,
    end_date: p.generatedAt,
    prev_actions_identified: prevActions.length ? "Yes" : "No",
    prev_actions_status: prevStatus,
    kpi_dashboard: kpiLines.join("\n"),
  };
}

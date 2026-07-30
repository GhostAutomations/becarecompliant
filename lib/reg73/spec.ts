/**
 * Be Care Compliant — Regulation 73 (RI branch visit) field spec.
 * ONE definition of the report's sections and fields, so the fillable form and the
 * PDF stay in step. `buildInitialData` turns the pulled site data (Reg73Prefill)
 * into the pre-filled starting values the RI then edits. No dashes in copy.
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
      { key: "prev_actions_status", label: "Summary of the current status of actions identified within the last RI visit", type: "text" },
    ],
  },
  {
    title: "Plan, do and review",
    fields: [
      { key: "staffing_structure_ok", label: "Is the branch structure in line with the company structure in the statement of purpose?", type: "yesno" },
      { key: "key_info_access_ok", label: "Does the branch have access to policies, procedures, staff and service user records, statement of purpose, service user guide and staff handbook?", type: "yesno" },
      { key: "review_systems_ok", label: "Is the branch meeting the KPI target system for new care package assessments and care plan reviews?", type: "yesno" },
      { key: "kpi_dashboard", label: "KPI dashboard performance", type: "text", hint: "Pre-filled from the site. Overdue counts and PQS rates for this branch." },
      { key: "plan", label: "What is the plan of action to ensure the branch achieves its KPI targets?", type: "text", ai: true },
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
    title: "Reviews",
    fields: [
      { key: "staffing_kpi_ok", label: "Is the branch meeting the KPI target system for workforce development?", type: "yesno" },
      { key: "premises_ok", label: "Are the branch premises well organised and displaying regulatory and insurance documents, statement of purpose and service user guides?", type: "yesno" },
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
    fields: [
      {
        key: "confirm_accurate",
        label: "I confirm the information in this report is correct and that I will sign the printed version.",
        type: "checkbox",
      },
      { key: "ri_signature", label: "Responsible Individual signature (optional, draw or upload)", type: "signature" },
    ],
  },
];

export const REG73_AI_FIELDS = REG73_SECTIONS.flatMap((s) => s.fields.filter((f) => f.ai).map((f) => f.key));

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

/** The pre-filled starting values for a new visit, from the pulled data. */
export function buildInitialData(p: Reg73Prefill, riName: string): Record<string, string> {
  const kpiLines = [
    `Staff overdue spot checks at today's date: ${p.spotCheckOverdue}.`,
    `Staff overdue supervisions at today's date: ${p.supervisionOverdue}.`,
    `Mandatory training compliance: ${pctText(p.pqs.mandatoryTraining)}. Safeguarding training: ${pctText(p.pqs.safeguarding)}.`,
    `Supervisions on time: ${pctText(p.pqs.supervisionOnTime)}. Care plan reviews on time: ${pctText(p.pqs.carePlanReviewOnTime)}.`,
    `Social Care Wales registration: ${pctText(p.pqs.scwRegistration)}.`,
  ];

  const prevStatus = p.previousVisit
    ? [
        `Previous visit ${p.previousVisit.endDate ? `ended ${p.previousVisit.endDate}` : ""}.`.trim(),
        typeof p.previousVisit.data?.plan === "string" && p.previousVisit.data.plan
          ? `Previous plan: ${p.previousVisit.data.plan as string}`
          : "",
        `Current position: ${p.spotCheckOverdue} spot checks and ${p.supervisionOverdue} supervisions overdue.`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const complaintsSeed = p.complaints.total
    ? `Complaints received in the last 3 months: ${p.complaints.total}. Themes: ${p.complaints.byType
        .map((t) => `${t.type} (${t.count})`)
        .join(", ")}.`
    : "No complaints have been received in the last 3 months.";

  return {
    ri_name: riName,
    start_date: p.generatedAt,
    end_date: p.generatedAt,
    prev_actions_identified: p.previousVisit ? "Yes" : "No",
    prev_actions_status: prevStatus,
    staffing_structure_ok: "Yes",
    key_info_access_ok: "Yes",
    review_systems_ok: "Yes",
    kpi_dashboard: kpiLines.join("\n"),
    staffing_kpi_ok: "Yes",
    premises_ok: "Yes",
    su_files_reviewed: "Yes",
    safeguarding_file_reviewed: "Yes",
    su_feedback_consistent: complaintsSeed,
    followup_arranged: "Yes",
    quality_audit_arranged: "Yes",
  };
}

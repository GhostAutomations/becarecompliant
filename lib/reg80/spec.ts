/**
 * Be Care Compliant — Regulation 80 (RISCA Wales) Quality of Care Review field spec.
 * ONE definition of the report's sections and fields, so the fillable form and the
 * PDF stay in step. `buildInitialData` turns the pulled site data (Reg80Prefill) into
 * the pre-filled starting values the RI then edits.
 *
 * The sections follow the provider's own Reg 80 template PLUS the statutory review
 * requirements in Regulation 80 of the Regulated Services (Service Providers and
 * Responsible Individuals) (Wales) Regulations 2017: engagement (Reg 76), analysis of
 * incidents, notifiable incidents, safeguarding, whistleblowing, concerns and
 * complaints (80(3)(b)), action taken on complaints (80(3)(c)), audit of records
 * (80(3)(d)), an overall assessment of the standard of care (80(4)(a)) and
 * recommendations for improvement (80(4)(b)). No dashes in copy. Our vocabulary only:
 * registers and the compliance matrix, never "board".
 */

import type { Reg80Prefill } from "@/lib/reg80/prefill";

export type Reg80FieldType = "yesno" | "text" | "date" | "signature" | "image";

export type Reg80Field = {
  key: string;
  label: string;
  type: Reg80FieldType;
  /** Narrative box the AI can draft from the pulled data. */
  ai?: boolean;
  /** Pre-filled from the site and re-pulled by Refresh data (kept in client state). */
  data?: boolean;
  hint?: string;
};

export type Reg80Section = { title: string; intro?: string; fields: Reg80Field[] };

export const REG80_SECTIONS: Reg80Section[] = [
  {
    title: "The review",
    fields: [
      { key: "ri_name", label: "Name of the Responsible Individual completing the review", type: "text" },
      { key: "period_start", label: "Review period start", type: "date" },
      { key: "period_end", label: "Review period end", type: "date" },
    ],
  },
  {
    title: "Previous review",
    fields: [
      { key: "prev_actions_identified", label: "Did the previous review make recommendations?", type: "yesno" },
      {
        key: "prev_actions_status",
        label: "Status of the recommendations from the last review",
        type: "text",
        data: true,
        hint: "Pre-filled from the last submitted review for this branch.",
      },
    ],
  },
  {
    title: "Company overview",
    fields: [{ key: "overview", label: "Overview of the organisation and this review period", type: "text", ai: true }],
  },
  {
    title: "Structure and support functions",
    fields: [
      {
        key: "structure",
        label: "Management and support structure (names and roles)",
        type: "text",
        hint: "Name the manager, deputy, seniors and office support. Headcount by role is in Staff turnover.",
      },
    ],
  },
  {
    title: "Staff turnover",
    fields: [
      {
        key: "staffing_levels",
        label: "Current staffing levels, starters and leavers",
        type: "text",
        data: true,
        hint: "Pre-filled from People: current headcount by role, and starters and leavers over 6 and 12 months.",
      },
    ],
  },
  {
    title: "Service user feedback",
    intro: "Engagement with individuals receiving care and their representatives (Regulation 76).",
    fields: [
      { key: "su_feedback", label: "Summary of service user feedback", type: "text", ai: true },
      { key: "su_feedback_positive", label: "Positive feedback (comments)", type: "text" },
      { key: "su_feedback_negative", label: "Areas identified for review or improvement (comments)", type: "text" },
      { key: "su_survey_image", label: "Survey ratings or chart (optional image)", type: "image" },
      { key: "su_feedback_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Staff feedback",
    intro: "Engagement with the staff team on the quality of care and how it can be improved (Regulation 76).",
    fields: [
      { key: "staff_feedback", label: "Summary of staff feedback", type: "text", ai: true },
      { key: "staff_feedback_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Complaints, concerns and lessons learnt",
    intro: "Aggregated complaints and concerns, and the action taken (Regulation 80(3)(b) and (c)).",
    fields: [
      {
        key: "complaints_summary",
        label: "Complaints and concerns in the period",
        type: "text",
        data: true,
        hint: "Pre-filled from Complaints: totals over 6 and 12 months, by nature and by category.",
      },
      { key: "complaints_lessons", label: "Lessons learnt", type: "text", ai: true },
      { key: "complaints_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Incidents, safeguarding and whistleblowing",
    intro:
      "Aggregated analysis of incidents, notifiable incidents, safeguarding matters and whistleblowing (Regulation 80(3)(b)). Recorded by the Responsible Individual; the platform does not hold these yet.",
    fields: [
      { key: "incidents_summary", label: "Incidents and notifiable incidents (aggregated)", type: "text" },
      { key: "safeguarding_summary", label: "Safeguarding matters (aggregated)", type: "text" },
      { key: "whistleblowing_summary", label: "Whistleblowing (aggregated)", type: "text" },
      { key: "incidents_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Quality assurance audits",
    intro: "Outcome of audits of the accuracy and completeness of records (Regulation 80(3)(d)).",
    fields: [
      {
        key: "audits_summary",
        label: "Audits completed in the period",
        type: "text",
        data: true,
        hint: "Pre-filled from Evidence: staff and service user audits completed, and the monthly average against target.",
      },
      { key: "audits_note", label: "Findings and commentary", type: "text", ai: true },
      { key: "audits_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Personal care plans and outcomes",
    fields: [
      {
        key: "care_plans_summary",
        label: "Care plan reviews and personal outcomes",
        type: "text",
        data: true,
        hint: "Pre-filled: care plan reviews on time, and how many service users have personal outcomes recorded.",
      },
      { key: "care_plans_note", label: "Commentary", type: "text", ai: true },
      { key: "care_plans_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Staffing: supervisions, mentoring and competency",
    fields: [
      {
        key: "supervision_summary",
        label: "Supervisions, spot checks, mentoring and competency",
        type: "text",
        data: true,
        hint: "Pre-filled from the compliance matrix: overdue supervisions, spot checks, manual handling and medication competency, and the supervision on time rate.",
      },
      { key: "supervision_note", label: "Commentary", type: "text", ai: true },
      { key: "supervision_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Call durations",
    intro: "Call duration monitoring. The platform does not hold call data, so this is recorded by the branch.",
    fields: [
      { key: "call_durations_note", label: "Call duration commentary", type: "text" },
      { key: "call_durations_image", label: "Call duration table (optional image)", type: "image" },
      { key: "call_durations_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Care logs and diary notes",
    fields: [
      { key: "care_logs_note", label: "Care logs and diary notes commentary", type: "text", ai: true },
      { key: "care_logs_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Training and development",
    fields: [
      {
        key: "training_summary",
        label: "Training, competency and Social Care Wales registration",
        type: "text",
        data: true,
        hint: "Pre-filled: mandatory and safeguarding training levels, and Social Care Wales registration.",
      },
      { key: "training_note", label: "Commentary", type: "text", ai: true },
      { key: "training_actions", label: "Action needed and measures", type: "text" },
    ],
  },
  {
    title: "Overall assessment of the standard of care",
    intro: "The Responsible Individual's assessment of the standard of care and support provided (Regulation 80(4)(a)).",
    fields: [{ key: "overall_assessment", label: "Overall assessment", type: "text", ai: true }],
  },
  {
    title: "Recommendations for improvement",
    intro: "Recommendations for the improvement of the service (Regulation 80(4)(b)).",
    fields: [{ key: "recommendations", label: "Recommendations", type: "text", ai: true }],
  },
  {
    title: "Sign off",
    fields: [{ key: "ri_signature", label: "Responsible Individual signature", type: "signature" }],
  },
];

export const REG80_AI_FIELDS = REG80_SECTIONS.flatMap((s) => s.fields.filter((f) => f.ai).map((f) => f.key));
export const REG80_DATA_FIELDS = REG80_SECTIONS.flatMap((s) => s.fields.filter((f) => f.data).map((f) => f.key));
export const REG80_IMAGE_FIELDS = REG80_SECTIONS.flatMap((s) =>
  s.fields.filter((f) => f.type === "image").map((f) => f.key),
);

function pctText(v: number | null): string {
  return v == null ? "no data" : `${v}%`;
}

function splitLine(label: string, s: { care: number; office: number; total: number }): string {
  return `${label}: ${s.total} (care ${s.care}, office ${s.office})`;
}

/** A compact, factual data summary the RI reads and the AI drafts from. */
export function reg80DataSummary(p: Reg80Prefill): string {
  const roles = p.staffing.roles.length
    ? p.staffing.roles.map((r) => `${r.count} ${r.title}`).join(", ")
    : "no staff recorded";
  const formality = p.complaints.formality6.length
    ? p.complaints.formality6.map((f) => `${f.type}: ${f.count}`).join(", ")
    : "none";
  const concerns = p.complaints.concern6.length
    ? p.complaints.concern6.map((c) => `${c.type}: ${c.count}`).join(", ")
    : "none";
  const auditAvg = p.audits.monthsInPeriod
    ? ((p.audits.people6 + p.audits.serviceUsers6) / p.audits.monthsInPeriod).toFixed(1)
    : "0";
  return [
    `Branch: ${p.branchName}. Review period ${p.periodStart} to ${p.periodEnd}.`,
    `Staffing: ${p.staffing.total} active staff (${roles}); care ${p.staffing.care}, office ${p.staffing.office}.`,
    `Turnover: ${splitLine("starters last 6 months", p.turnover.starters6)}, ${splitLine("starters last 12 months", p.turnover.starters12)}; ${splitLine("leavers last 6 months", p.turnover.leavers6)}, ${splitLine("leavers last 12 months", p.turnover.leavers12)}.`,
    `Complaints and concerns: ${p.complaints.total6} in the last 6 months, ${p.complaints.total12} in the last 12 months. By nature: ${formality}. By category: ${concerns}.`,
    `Audits: ${p.audits.people6} staff audits and ${p.audits.serviceUsers6} service user audits in ${p.audits.monthsInPeriod} months, an average of ${auditAvg} per month against a target of ${p.audits.targetPerMonth}.`,
    `Care plan reviews on time ${pctText(p.pqs.carePlanReviewOnTime)}. Personal outcomes: ${p.outcomes.withOutcomes} of ${p.outcomes.totalServiceUsers} service users have outcomes recorded.`,
    `Overdue at today's date: supervisions ${p.overdue.supervision}, spot checks ${p.overdue.spotCheck}, manual handling competency ${p.overdue.manualHandling}, medication competency ${p.overdue.medication}, mentoring ${p.overdue.mentoring}. Supervision on time ${pctText(p.pqs.supervisionOnTime)}.`,
    `Training: mandatory ${pctText(p.pqs.mandatoryTraining)}, safeguarding ${pctText(p.pqs.safeguarding)}. Social Care Wales registration: ${p.scw.withoutRegistration} of ${p.scw.activeStaff} active staff are not registered (registered on time rate ${pctText(p.pqs.scwRegistration)}).`,
    `Customer satisfaction ${pctText(p.pqs.customerSatisfaction)}.`,
  ].join(" ");
}

/** The pre-filled starting values for a new review, from the pulled data. */
export function buildInitialData(p: Reg80Prefill, riName: string): Record<string, string> {
  const staffingLines = [
    `Current staffing: ${p.staffing.total} active staff (care ${p.staffing.care}, office ${p.staffing.office}).`,
    `By role: ${p.staffing.roles.map((r) => `${r.count} ${r.title}`).join(", ") || "none recorded"}.`,
    `Starters: ${p.turnover.starters6.total} in the last 6 months (care ${p.turnover.starters6.care}, office ${p.turnover.starters6.office}); ${p.turnover.starters12.total} in the last 12 months.`,
    `Leavers: ${p.turnover.leavers6.total} in the last 6 months (care ${p.turnover.leavers6.care}, office ${p.turnover.leavers6.office}); ${p.turnover.leavers12.total} in the last 12 months.`,
  ];

  const complaintsLines = [
    `${p.complaints.total6} complaints and concerns in the last 6 months, ${p.complaints.total12} in the last 12 months.`,
    `By nature (6 months): ${p.complaints.formality6.map((f) => `${f.type} ${f.count}`).join(", ") || "none"}.`,
    `By category (6 months): ${p.complaints.concern6.map((c) => `${c.type} ${c.count}`).join(", ") || "none"}.`,
  ];

  const auditAvg = p.audits.monthsInPeriod
    ? ((p.audits.people6 + p.audits.serviceUsers6) / p.audits.monthsInPeriod).toFixed(1)
    : "0";
  const auditLines = [
    `${p.audits.people6} staff audits and ${p.audits.serviceUsers6} service user audits completed in the last ${p.audits.monthsInPeriod} months.`,
    `Average ${auditAvg} per month against a target of ${p.audits.targetPerMonth} per month.`,
  ];

  const carePlanLines = [
    `Care plan reviews completed on time: ${pctText(p.pqs.carePlanReviewOnTime)}.`,
    `Personal outcomes: ${p.outcomes.withOutcomes} of ${p.outcomes.totalServiceUsers} service users have outcomes recorded.`,
  ];

  const supervisionLines = [
    `Overdue at today's date: ${p.overdue.supervision} supervisions, ${p.overdue.spotCheck} spot checks, ${p.overdue.mentoring} mentoring.`,
    `Competency overdue: ${p.overdue.manualHandling} manual handling, ${p.overdue.medication} medication.`,
    `Supervision on time rate: ${pctText(p.pqs.supervisionOnTime)}.`,
  ];

  const trainingLines = [
    `Mandatory training: ${pctText(p.pqs.mandatoryTraining)}. Safeguarding training: ${pctText(p.pqs.safeguarding)}.`,
    `Social Care Wales registration: ${p.scw.withoutRegistration} of ${p.scw.activeStaff} active staff are not registered (registered on time rate ${pctText(p.pqs.scwRegistration)}).`,
  ];

  const prevData = p.previousReview?.data as Record<string, unknown> | undefined;
  const prevRecs = typeof prevData?.recommendations === "string" ? (prevData.recommendations as string) : "";
  const prevStatus = p.previousReview
    ? [
        `Previous review${p.previousReview.periodEnd ? ` to ${p.previousReview.periodEnd}` : ""}.`,
        prevRecs
          ? `Recommendations made last period:\n${prevRecs}`
          : "Review the recommendations made in the last report and record progress against each.",
      ].join("\n")
    : "";

  return {
    ri_name: riName,
    period_start: p.periodStart,
    period_end: p.periodEnd,
    prev_actions_identified: p.previousReview ? "Yes" : "No",
    prev_actions_status: prevStatus,
    staffing_levels: staffingLines.join("\n"),
    complaints_summary: complaintsLines.join("\n"),
    audits_summary: auditLines.join("\n"),
    care_plans_summary: carePlanLines.join("\n"),
    supervision_summary: supervisionLines.join("\n"),
    training_summary: trainingLines.join("\n"),
  };
}

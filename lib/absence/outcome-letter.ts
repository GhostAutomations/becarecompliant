/**
 * Be Care Compliant — the absence meeting outcome letter (Phil, 2026-09-29, Absence round 2 item 3).
 *
 * The AI writes only the MIDDLE of the letter (what was discussed and what was decided) from the
 * meeting's own Evidence. The company's fixed wording in Settings, Letters wraps it: the opening,
 * the right of appeal and the sign off, through {{outcome_body}}. The manager reads and edits the
 * middle, checks the whole letter, and approves it.
 *
 * Pure and isomorphic, so it can be tested and the dialog can build the same text the server sends.
 *
 * PRIVACY: the model is sent what the meeting recorded and nothing that identifies the employee.
 */

export const OUTCOME_BODY_LIMIT = 6000;

export const OUTCOME_SYSTEM = [
  "You are helping a UK care sector manager write the middle part of a formal letter confirming the",
  "outcome of an absence management meeting. You write ONLY from the meeting record you are given.",
  "Never add a fact, a date, a target or a decision that is not in the record, and never change the",
  "outcome or the warning that was recorded. Write to the employee as \"you\", in plain, calm, respectful",
  "British English. No dashes. No names.",
  "Write two to five short paragraphs, as plain text with a blank line between paragraphs: what the",
  "meeting covered (the absences discussed and the explanation given, briefly), any support or",
  "adjustments agreed, the outcome, and when a warning was given, what it is and until when it stays",
  "live, then any targets and the review date. Where the record says nothing about one of these, leave",
  "it out rather than guess.",
  "Do NOT write a greeting, a sign off, a subject line, anything about the right of appeal, or any",
  "heading: the company's own wording around your text already has those. No markdown, no bullet points.",
].join(" ");

export function clipText(text: unknown, max = 700): string {
  if (typeof text !== "string") return "";
  const t = text.replace(/[ \t]+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The parts of the meeting's Evidence the letter is written from. Names and signatures left out. */
export function outcomeFacts(answers: Record<string, unknown> | null | undefined): string[] {
  if (!answers) return [];
  const lines: string[] = [];
  const add = (label: string, key: string, max = 700) => {
    const t = clipText(answers[key], max);
    if (t) lines.push(`${label}: ${t}`);
  };
  add("Meeting", "meeting_type", 40);
  add("Date of the meeting", "date_of_meeting", 20);
  add("Absences discussed", "dates_of_absence_discussed", 500);
  add("The employee's explanation", "employees_explanation");
  add("The manager's comments", "managers_comments");
  add("Support and adjustments discussed", "support_adjustments_discussed");
  add("Questions asked and answers", "meeting_questions", 1500);
  add("Outcome of the meeting", "meeting_outcome", 80);
  add("Warning or dismissal", "warning_issued", 40);
  add("Warning remains live until", "warning_live_until", 20);
  add("Improvement targets", "improvement_targets");
  add("Review date", "review_date", 20);
  return lines;
}

export function buildOutcomePrompt(opts: {
  stage: number | null;
  stageAction: string | null;
  facts: string[];
}): string {
  return [
    opts.stage ? `This was a Stage ${opts.stage} absence management meeting.` : "This was a formal absence management meeting.",
    opts.stageAction
      ? `Under the company's procedure a Stage ${opts.stage} meeting can lead to up to and including: ${opts.stageAction}. That is the most it could lead to, not what was decided.`
      : "",
    "",
    "The meeting record:",
    ...(opts.facts.length ? opts.facts.map((f) => `- ${f}`) : ["- nothing recorded"]),
  ]
    .filter((l, i) => l !== "" || i > 1)
    .join("\n");
}

/**
 * Tidy the model's text into letter paragraphs: no fence, no markdown emphasis or bullets, no dashes
 * used as punctuation, single blank lines between paragraphs.
 */
export function cleanOutcomeBody(raw: string): string {
  let t = (raw ?? "").trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "");
  t = t
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[ \t]*[-*•][ \t]+/gm, "")
    .replace(/^#+[ \t]*/gm, "")
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return t.trim().slice(0, OUTCOME_BODY_LIMIT);
}

/** What the manager approved, ready to merge: trimmed, capped, paragraphs kept. */
export function normaliseApprovedBody(body: unknown): string {
  if (typeof body !== "string") return "";
  return body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, OUTCOME_BODY_LIMIT);
}

/** dd/mm/yyyy from an ISO date, or the input unchanged. */
export function slashDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Merge {{tokens}} and split into paragraphs: the letter as plain text, for the PDF and the record. */
export function letterParagraphs(template: string, values: Record<string, string>): string[] {
  const merged = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) ? values[token] : whole,
  );
  return merged
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

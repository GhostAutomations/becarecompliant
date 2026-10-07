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
  "The letter must be DETAILED (Phil, 2026-10-07: a short summary is not enough for an employment",
  "record). Write four to seven paragraphs, as plain text with a blank line between paragraphs, in",
  "this order:",
  "1. What was discussed: take each absence the meeting covered in turn and say what the employee",
  "explained about it and anything they confirmed (for example that a problem is now resolved), using",
  "their answers to the questions asked. The letter already lists the absences with their dates above",
  "your text, so refer to them by date and reason rather than listing them again.",
  "2. Support and adjustments agreed, and any monitoring period, in full.",
  "3. The outcome and the warning in full: what was decided, the warning given and why (their absences",
  "reached the stage's trigger, as the record states), how long the warning stays live (its live",
  "until date, if recorded), and the review date, if recorded.",
  "4. What happens next: use the 'If attendance does not improve' line from the record, word for word",
  "in meaning, so they know what a further absence could lead to. Leave this out only if the record",
  "has no such line.",
  "Where the record says nothing about one of these, leave it out rather than guess.",
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

/** What the manager approved, ready to merge: trimmed and capped. Extra blank lines are KEPT (up
 *  to four in a row): the manager presses Enter to space the letter (Phil, 2026-10-07). */
export function normaliseApprovedBody(body: unknown): string {
  if (typeof body !== "string") return "";
  return body
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{6,}/g, "\n\n\n\n\n")
    .trim()
    .slice(0, OUTCOME_BODY_LIMIT);
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
  // A blank line starts a new paragraph; each EXTRA blank line is kept as an empty paragraph, so
  // the letter shows the space the manager added. Empty ones at either end are dropped.
  // Each Enter beyond the blank line between paragraphs is one empty line in the letter.
  const SPACE = "\u0000";
  const parts = merged
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, (run) => `\n\n${`${SPACE}\n\n`.repeat(run.length - 2)}`)
    .split(/\n\n/)
    .map((p) => (p === SPACE ? "" : p.replace(/^\n+|\n+$/g, "").trim()));
  while (parts.length && !parts[0]) parts.shift();
  while (parts.length && !parts[parts.length - 1]) parts.pop();
  return parts;
}


/** Paragraphs back into the text the manager edits: a blank line between paragraphs, and one more
 *  Enter for each empty line. The exact reverse of letterParagraphs. */
export function joinLetterParagraphs(paragraphs: string[]): string {
  let out = "";
  let spaces = 0;
  for (const p of paragraphs) {
    if (!p) {
      if (out) spaces += 1;
      continue;
    }
    out = out ? `${out}\n\n${"\n".repeat(spaces)}${p}` : p;
    spaces = 0;
  }
  return out;
}

/**
 * Facts about the stage for the letter (Phil, 2026-10-07): why this stage was reached, and what the
 * next one could lead to, so the letter can say "what happens next". From Settings, Absence.
 */
export function stageFacts(opts: {
  stage: number | null;
  thresholds: Array<{ stage: number; occasions: number; action?: string | null }>;
  windowWords: string;
  /** "Stage 3 disciplinary hearing": the company's own name for the meetings. */
  label?: (stage: number) => string;
}): string[] {
  const label = opts.label ?? ((n: number) => `Stage ${n} meeting`);
  if (!opts.stage) return [];
  const out: string[] = [];
  const at = opts.thresholds.find((t) => t.stage === opts.stage);
  if (at?.occasions) {
    out.push(`Why this stage: Stage ${opts.stage} is reached at ${at.occasions} absences within ${opts.windowWords}`);
  }
  const next = opts.thresholds.find((t) => t.stage === opts.stage! + 1);
  if (next?.occasions) {
    out.push(
      `If attendance does not improve: ${next.occasions === (at?.occasions ?? 0) + 1 ? "a further absence" : `reaching ${next.occasions} absences within ${opts.windowWords}`} may lead to a ${label(next.stage)}${next.action ? `, which could result in up to and including a ${next.action.toLowerCase()}` : ""}`,
    );
  }
  return out;
}

/** The absences block that opens the outcome, laid out like the invitation's list. */
export function absencesBlock(lines: string[]): string {
  if (lines.length === 0) return "";
  const intro = lines.length === 1 ? "The meeting covered the following absence:" : `The meeting covered the following ${lines.length} absences:`;
  return [intro, ...lines.map((l) => `\u2022 ${l}`)].join("\n");
}

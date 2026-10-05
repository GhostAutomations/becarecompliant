/**
 * Be Care Compliant: the Outcomes section of the Individual Plan Review (Phil, 2026-10-05).
 *
 * "it should just be called outcomes and it should auto fill with the service users outcomes
 * and if they dont have one, look at adding one ... we dont want this section to be too long".
 *
 * The old section asked the reviewer HOW MANY outcomes the person had and then to retype each
 * one with a status. None of it reached the Outcomes page, so the two drifted apart and the
 * outcomes PQS figure never heard about a review. Now:
 *
 *   1. Every active outcome is put in front of the reviewer (title and target date from the
 *      record), and each asks two things: progress since the last review, and what has helped
 *      or got in the way. That follows Birdie's update (progressing, regressing, no change, or
 *      completed) and Social Care Wales' outcomes guidance on reflecting at review.
 *   2. "Are there any outcomes you would like to achieve that are not currently being assisted
 *      with?" (moved from Customer Satisfaction, not scored). Yes opens a new outcome; No is
 *      a real answer, even for someone with none.
 *   3. Submitting logs each answer as that outcome's update on the Outcomes page (Achieved
 *      marks it achieved, Phil's choice) and creates the new one. See outcomes-review-apply.ts.
 *
 * Pure and isomorphic: the renderer, the validator, the evidence formatter and the server all
 * read the answer through these functions, so they cannot disagree about what it means.
 */

export type ReviewProgress = "achieved" | "progressing" | "no_change" | "regressing";

export const REVIEW_PROGRESS: { value: ReviewProgress; label: string }[] = [
  { value: "achieved", label: "Achieved" },
  { value: "progressing", label: "Progressing" },
  { value: "no_change", label: "No change" },
  { value: "regressing", label: "Regressing" },
];

export type OutcomeReviewLine = {
  /** The outcome on the record. Never trusted from the browser: the server rebuilds the
   *  list from the record and keeps only the answers that belong to it. */
  id: string;
  title: string;
  target: string | null;
  progress: ReviewProgress | "";
  note: string;
};

export type OutcomesReviewValue = {
  current: OutcomeReviewLine[];
  add: "Yes" | "No" | "";
  newTitle: string;
  newSupport: string;
  newTarget: string;
};

export const EMPTY_OUTCOMES_REVIEW: OutcomesReviewValue = {
  current: [],
  add: "",
  newTitle: "",
  newSupport: "",
  newTarget: "",
};

const PROGRESS_VALUES = new Set<string>(REVIEW_PROGRESS.map((p) => p.value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Read whatever arrived into the one shape, dropping anything that does not fit. */
export function parseOutcomesReview(v: unknown): OutcomesReviewValue {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...EMPTY_OUTCOMES_REVIEW, current: [] };
  const o = v as Record<string, unknown>;
  const current = Array.isArray(o.current)
    ? o.current
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && !Array.isArray(l))
        .map((l) => ({
          id: str(l.id, 64),
          title: str(l.title, 300),
          target: typeof l.target === "string" && ISO.test(l.target) ? l.target : null,
          progress: (PROGRESS_VALUES.has(String(l.progress)) ? l.progress : "") as ReviewProgress | "",
          note: str(l.note, 2000),
        }))
        .filter((l) => l.id)
    : [];
  const add = o.add === "Yes" || o.add === "No" ? o.add : "";
  return {
    current,
    add,
    newTitle: str(o.newTitle, 300),
    newSupport: str(o.newSupport, 2000),
    newTarget: typeof o.newTarget === "string" && ISO.test(o.newTarget) ? o.newTarget : "",
  };
}

/** The question that opens the new outcome (Phil, 2026-10-05: moved here from Customer
 *  Satisfaction, no longer scored). Asked whether or not they have outcomes, and No is a
 *  real answer: someone may not want one. */
export const NEW_OUTCOME_QUESTION =
  "Are there any outcomes you would like to achieve that are not currently being assisted with?";

/** True when a new outcome is being set. */
export function settingNew(v: OutcomesReviewValue): boolean {
  return v.add === "Yes";
}

/** The one message the form shows under the section, or null when it is complete. Every
 *  part is required (Phil, 2026-09-14: review questions are mandatory). */
export function outcomesReviewError(v: OutcomesReviewValue): string | null {
  for (let i = 0; i < v.current.length; i++) {
    const l = v.current[i];
    const which = v.current.length > 1 ? `"${l.title || `Outcome ${i + 1}`}": ` : "";
    if (!l.progress) return `${which}choose the progress since the last review.`;
    if (!l.note.trim()) return `${which}say what has helped, or got in the way.`;
  }
  if (!v.add) return "Say whether there are any outcomes they would like to achieve.";
  if (settingNew(v)) {
    if (!v.newTitle.trim()) return "Say what the new outcome is.";
    if (!v.newSupport.trim()) return "Say how we will support the new outcome.";
    if (!v.newTarget) return "Give the new outcome a target date.";
  }
  return null;
}

/** Overlay the record's current outcomes onto what was typed. Order, titles and dates come
 *  from the record; the reviewer's answers are kept only for outcomes still on it. */
export function withRecordOutcomes(
  typed: OutcomesReviewValue,
  record: ReadonlyArray<{ id: string; title: string; target: string | null }>,
): OutcomesReviewValue {
  const byId = new Map(typed.current.map((l) => [l.id, l]));
  return {
    ...typed,
    current: record.map((r) => ({
      id: r.id,
      title: r.title,
      target: r.target,
      progress: byId.get(r.id)?.progress ?? "",
      note: byId.get(r.id)?.note ?? "",
    })),
  };
}

const LABEL = new Map(REVIEW_PROGRESS.map((p) => [p.value, p.label]));

function ukDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** The section in words, for the Evidence screen and the PDF. */
export function describeOutcomesReview(v: OutcomesReviewValue): string {
  const lines: string[] = [];
  for (const l of v.current) {
    lines.push(`${l.title}: ${l.progress ? LABEL.get(l.progress) : "Not answered"}`);
    if (l.note.trim()) lines.push(`  ${l.note.trim()}`);
  }
  if (settingNew(v) && v.newTitle.trim()) {
    lines.push(`New outcome: ${v.newTitle.trim()}`);
    if (v.newSupport.trim()) lines.push(`  How we will support it: ${v.newSupport.trim()}`);
    if (v.newTarget) lines.push(`  Target date: ${ukDay(v.newTarget)}`);
  } else if (v.add === "No") {
    lines.push("No other outcomes they would like to achieve.");
  }
  return lines.length ? lines.join("\n") : "Not answered";
}

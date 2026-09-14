/**
 * Be Care Compliant — which questions make up the customer satisfaction score.
 *
 * Phil, 2026-09-12: the questions belong to the company, editable in Settings, "they should
 * only be editable in there settings to protect the scoring mechanism".
 *
 * THE RULE IS IN THE SCHEMA, NOT IN THIS FILE. A question counts because its field carries
 * `satisfaction: true`, and Evidence freezes the whole schema when it is submitted. So a
 * review completed in January is scored on January's questions even if the company changed
 * the list in March, and a figure already reported to CIW cannot be rewritten by an edit
 * made afterwards. That is why this module reads a schema rather than holding a list.
 *
 * Pure and isomorphic, so the settings screen, the register, the CSV and the scoring all ask
 * the same function and cannot drift apart.
 */

import type { FormField, FormSchema } from "@/lib/form-schema";

/* Flattened here rather than imported, so this module carries NO runtime import and stays
   unit testable under node --experimental-strip-types, like the other pure modules. */
function allFields(schema: FormSchema): FormField[] {
  return (schema.sections ?? []).flatMap((s) => s.fields ?? []);
}

export const SATISFACTION_SECTION_TITLE = "Customer Satisfaction";

/** The follow-up that opens when a satisfaction question is answered No. */
export function detailKeyFor(key: string): string {
  return `${key}_detail`;
}

export type SatisfactionQuestion = {
  key: string;
  label: string;
  /** False for the ones that ship as standard, so the screen can say where they came from. */
  custom: boolean;
};

/**
 * The keys that shipped as standard. Used ONLY to label a row on the settings screen as
 * standard rather than the company's own — never to decide what is scored, which is always
 * the flag. Phil chose full control: a company may reword or remove any of them.
 */
export const STANDARD_SATISFACTION_QUESTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "schedule_matches", label: "Does this match the calls being delivered?" },
  { key: "review_previous_setup", label: "Do the call times and number of visits match what was agreed?" },
  { key: "call_times_suit", label: "Do the call times suit you at the moment?" },
];

export const STANDARD_SATISFACTION_KEYS: ReadonlySet<string> = new Set(
  STANDARD_SATISFACTION_QUESTIONS.map((q) => q.key),
);

/** Is this field one of the scored questions? */
export function isSatisfactionField(f: FormField): boolean {
  return f.satisfaction === true;
}

/**
 * The scored questions in a schema, in the order they are asked.
 *
 * Falls back to the three that shipped as standard ONLY for a schema written before the flag
 * existed, so Evidence recorded in that window still scores the way it did on the day. New
 * schemas always carry the flag, so the fallback dies out on its own.
 */
export function satisfactionQuestions(schema: FormSchema): SatisfactionQuestion[] {
  const fields = allFields(schema);
  const flagged = fields.filter(isSatisfactionField);
  const chosen = flagged.length > 0
    ? flagged
    : fields.filter((f) => STANDARD_SATISFACTION_KEYS.has(f.key));
  return chosen.map((f) => ({
    key: f.key,
    label: f.label,
    custom: !STANDARD_SATISFACTION_KEYS.has(f.key),
  }));
}

/** Just the keys, for scoring an answers object. */
export function satisfactionKeys(schema: FormSchema): string[] {
  return satisfactionQuestions(schema).map((q) => q.key);
}

/**
 * Score one set of answers against the questions its own schema says were asked.
 * Anything not answered counts for nothing: a review that skipped a question is not a
 * review that failed it.
 */
export function scoreAnswers(
  schema: FormSchema,
  answers: Record<string, unknown>,
): { positive: number; answered: number; byKey: Record<string, "Yes" | "No" | null> } {
  const byKey: Record<string, "Yes" | "No" | null> = {};
  let positive = 0;
  let answered = 0;
  for (const q of satisfactionQuestions(schema)) {
    const v = normaliseYesNo(answers?.[q.key]);
    byKey[q.key] = v;
    if (v === null) continue;
    answered += 1;
    if (v === "Yes") positive += 1;
  }
  return { positive, answered, byKey };
}

/** Yes / No however it was stored, and null for anything else. */
export function normaliseYesNo(v: unknown): "Yes" | "No" | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes") return "Yes";
  if (s === "no") return "No";
  return null;
}

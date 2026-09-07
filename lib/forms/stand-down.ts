/**
 * Be Care Compliant — standing down the rest of a Form.
 *
 * Some questions make the rest of the form pointless. A Spot Check that could not be
 * done has no arrival, no medication, no observations and no Service User: asking for
 * forty answers that do not exist is how a compliance record ends up full of invented
 * ones (Phil, 2026-09-07: "if they select no, all other questions below it inc Service
 * User should grey out so they can submit the form but not need to enter something in
 * all mandatory fields").
 *
 * The rule lives on the ONE question that decides it, not on each of the questions it
 * silences. A field carrying `standsDown` stands down every field AFTER it in document
 * order the moment its answer matches. Put the rule on the gate and a question added to
 * the form next year is covered without anybody remembering to mark it.
 *
 * A stood down field is greyed, never required, and its answer is dropped on submit, so
 * the Evidence records that the questions were not asked rather than answered blank.
 *
 * Pure and self-contained (no imports) so it can be unit tested directly.
 */

/** The gate: when the field carrying this is answered with one of `when`. */
export type StandsDownRule = { when: string[] };

/** The only shape this module needs from a form field. */
export type GatedField = { key: string; standsDown?: StandsDownRule };

/** Every form an answer can take, as the strings a rule is written in. */
function asChoices(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

/**
 * The keys of every field that is stood down by the answers so far.
 *
 * The gate itself is never stood down — it has to stay answerable, or there would be no
 * way back. A field already stood down is not consulted as a gate either: its answer is
 * on its way out, and a value nobody can see must never decide anything.
 */
export function standDownKeys(
  fields: ReadonlyArray<GatedField>,
  answers: Readonly<Record<string, unknown>>,
): Set<string> {
  const out = new Set<string>();
  let standing = false;
  for (const field of fields) {
    if (standing) {
      out.add(field.key);
      continue;
    }
    const rule = field.standsDown;
    if (rule && asChoices(answers[field.key]).some((v) => rule.when.includes(v))) {
      standing = true;
    }
  }
  return out;
}

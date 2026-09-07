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
 * `except` names the questions that survive: the ones that exist BECAUSE of the answer
 * that stood the rest down. A Spot Check that could not be done still has to say why,
 * and that question sits under the gate rather than above it, where it reads correctly.
 *
 * A stood down field is greyed, never required, and its answer is dropped on submit, so
 * the Evidence records that the questions were not asked rather than answered blank.
 *
 * AND THE CHECK IS NOT ADVANCED (Phil, 2026-09-07: "if they select not able to complete
 * it must not update the matrix"). A spot check that did not happen has not been done:
 * the Evidence is kept, because an attempt and its reason are worth recording, but the
 * Check stays due and the matrix keeps showing it. That is the DEFAULT for any gate --
 * a compliance system must never credit something that did not happen -- and a gate
 * that means something else has to say so with `completesCheck: true`.
 *
 * Pure and self-contained (no imports) so it can be unit tested directly.
 */

/**
 * The gate: when the field carrying this is answered with one of `when`, every later
 * field stands down apart from the keys in `except`.
 *
 * `completesCheck` defaults to FALSE: tripping a gate normally means the thing did not
 * happen, so the Check it was opened from is left due. Set it true only for a gate that
 * silences part of a form without the activity itself having failed.
 */
export type StandsDownRule = { when: string[]; except?: string[]; completesCheck?: boolean };

/** The only shape this module needs from a form field. */
export type GatedField = { key: string; standsDown?: StandsDownRule };

/** Every form an answer can take, as the strings a rule is written in. */
function asChoices(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

/** The first gate the answers have tripped, with its position, or null. */
function trippedGate(
  fields: ReadonlyArray<GatedField>,
  answers: Readonly<Record<string, unknown>>,
): { at: number; rule: StandsDownRule } | null {
  for (let i = 0; i < fields.length; i++) {
    const rule = fields[i].standsDown;
    if (rule && asChoices(answers[fields[i].key]).some((v) => rule.when.includes(v))) {
      return { at: i, rule };
    }
  }
  return null;
}

/**
 * The keys of every field that is stood down by the answers so far — the questions that
 * an earlier answer has made pointless.
 *
 * The gate itself is never stood down — it has to stay answerable, or there would be no
 * way back — and neither is anything the gate spares by name. Only the FIRST gate to
 * trip decides: a later gate sits inside the region it silenced, and a value nobody can
 * see must never decide anything.
 */
export function standDownKeys(
  fields: ReadonlyArray<GatedField>,
  answers: Readonly<Record<string, unknown>>,
): Set<string> {
  const hit = trippedGate(fields, answers);
  if (!hit) return new Set();
  const spared = new Set(hit.rule.except ?? []);
  const out = new Set<string>();
  for (let i = hit.at + 1; i < fields.length; i++) {
    if (!spared.has(fields[i].key)) out.add(fields[i].key);
  }
  return out;
}

/**
 * Did the thing this Form records actually happen?
 *
 * False when a gate has been tripped that does not claim otherwise, which is the point:
 * the Evidence is still stored, but the Check is not advanced, its last completed date
 * is untouched, and it keeps showing as due. True whenever no gate is tripped, so every
 * form without a gate behaves exactly as it always has.
 */
export function completesCheck(
  fields: ReadonlyArray<GatedField>,
  answers: Readonly<Record<string, unknown>>,
): boolean {
  const hit = trippedGate(fields, answers);
  return hit === null || hit.rule.completesCheck === true;
}

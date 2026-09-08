/**
 * Be Care Compliant — filling in the answers a form works out for itself.
 *
 * The score_total and score_band fields are computed, never typed, so their answers do not
 * come from the person filling the form in. This puts the right values into the answers,
 * and it is called in TWO places on purpose:
 *
 *  - the renderer, so the totals move as the questions are answered;
 *  - the submit path on the SERVER, so what is stored as Evidence is what the schema says
 *    it should be rather than whatever the browser posted. A score is the part of an
 *    appraisal somebody has a reason to lean on, and a number that arrives from a client
 *    is a number that can be edited on the way.
 *
 * Deterministic and side effect free: same schema and answers, same result, which is what
 * lets the two callers agree.
 */

import { combineTotals, scoreBand, scoreLabel, scoreTotal, type ScoreTotal } from "./scoring";
import type { Answers, FormField, FormSchema } from "../form-schema";

/** Every field in the schema, in order. Local so this module stays cheap to import. */
function fields(schema: FormSchema): FormField[] {
  return (schema.sections ?? []).flatMap((s) => s.fields ?? []);
}

/**
 * Return the answers with every computed field filled in.
 *
 * A score_total stores its label ("48 of 48"), which is what reads correctly on screen, in
 * the PDF and in an export years later, when nobody has the schema to hand to work out
 * what the denominator was.
 */
export function computeScores(schema: FormSchema, answers: Answers): Answers {
  const all = fields(schema);
  if (!all.some((f) => f.type === "score_total" || f.type === "score_band")) return answers;

  const out: Answers = { ...answers };
  const totals = new Map<string, ScoreTotal>();

  for (const field of all) {
    if (field.type !== "score_total") continue;
    const total = scoreTotal(out, field.sum ?? [], field.pointsPerQuestion ?? 3);
    totals.set(field.key, total);
    out[field.key] = scoreLabel(total);
  }

  for (const field of all) {
    if (field.type !== "score_band") continue;
    const parts = (field.from ?? []).map((k) => totals.get(k)).filter((t): t is ScoreTotal => !!t);
    const combined = combineTotals(parts);
    out[field.key] = scoreBand(combined, field.bands ?? [], field.fullScale ?? 0) ?? "";
  }

  return out;
}

/** The combined total behind a score_band, for showing the number beside the band. */
export function bandTotal(schema: FormSchema, answers: Answers, field: FormField): ScoreTotal {
  const parts: ScoreTotal[] = [];
  for (const other of fields(schema)) {
    if (other.type !== "score_total") continue;
    if (!(field.from ?? []).includes(other.key)) continue;
    parts.push(scoreTotal(answers, other.sum ?? [], other.pointsPerQuestion ?? 3));
  }
  return combineTotals(parts);
}

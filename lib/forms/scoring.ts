/**
 * Be Care Compliant — a form that adds itself up.
 *
 * WHY (Phil, 2026-09-08, of the Annual Appraisal): "there is a scoring system on there,
 * lets make this add up automatically." Thistle's appraisal scores twenty one questions
 * out of three, then asks the manager to total each section by hand, total the three
 * sections by hand, and read the result off a band table. Five sums at the end of a long
 * meeting, none of which the person filling it in should have to do and any of which they
 * can get wrong. Nobody checking the file a year later would ever know.
 *
 * NOT APPLICABLE MEANS NOT COUNTED, BOTH WAYS. Thistle's own rule is "if the answer is not
 * applicable please do not include question points in the final score", but the band table
 * is written as though all twenty one always apply: five N/As cap the score at 48, so that
 * person could never reach the top band however well they did. So the band is worked out
 * from the points that were ACTUALLY AVAILABLE (Phil, 2026-09-08), and the score is shown
 * as "48 of 48" so the denominator is never hidden.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** A band of the scale, by share of the points available. `upTo` is inclusive. */
export type ScoreBand = { upTo: number; label: string };

export type ScoreTotal = {
  /** Points scored. */
  score: number;
  /** Points that were available, ignoring anything answered N/A. */
  outOf: number;
  /** How many of the questions counted. */
  counted: number;
  /** How many were answered N/A. */
  notApplicable: number;
};

/** The value that means a question does not apply. */
export const NOT_APPLICABLE = "na";

/**
 * Add up the answers to the given keys.
 *
 * An unanswered question counts for nothing and is not yet available either: a half filled
 * form reads "6 of 6", not "6 of 63", so the running total is always true rather than
 * pretending the rest are zeros.
 */
export function scoreTotal(
  answers: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
  pointsPerQuestion = 3,
): ScoreTotal {
  let score = 0;
  let counted = 0;
  let notApplicable = 0;
  for (const key of keys) {
    const raw = answers[key];
    if (raw === null || raw === undefined || raw === "") continue;
    if (String(raw) === NOT_APPLICABLE) {
      notApplicable += 1;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    score += n;
    counted += 1;
  }
  return { score, outOf: counted * pointsPerQuestion, counted, notApplicable };
}

/** Add several totals together, for an overall score across sections. */
export function combineTotals(totals: ReadonlyArray<ScoreTotal>): ScoreTotal {
  return totals.reduce<ScoreTotal>(
    (acc, t) => ({
      score: acc.score + t.score,
      outOf: acc.outOf + t.outOf,
      counted: acc.counted + t.counted,
      notApplicable: acc.notApplicable + t.notApplicable,
    }),
    { score: 0, outOf: 0, counted: 0, notApplicable: 0 },
  );
}

/**
 * The band a total falls in, as a share of what was available.
 *
 * `bands` are given against the FULL scale (Thistle's 0 to 63) and are read as
 * proportions of it, so the same table works whatever N/A leaves available. Null when
 * nothing has been scored yet, because no band is honest about an empty form.
 */
export function scoreBand(
  total: ScoreTotal,
  bands: ReadonlyArray<ScoreBand>,
  fullScale: number,
): string | null {
  if (total.outOf <= 0 || fullScale <= 0 || bands.length === 0) return null;
  const share = total.score / total.outOf;
  for (const band of bands) {
    if (share <= band.upTo / fullScale) return band.label;
  }
  return bands[bands.length - 1].label;
}

/** "48 of 48" — the score with the denominator it was actually out of. */
export function scoreLabel(total: ScoreTotal): string {
  return `${total.score} of ${total.outOf}`;
}

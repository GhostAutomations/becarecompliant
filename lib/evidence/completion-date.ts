/**
 * Be Care Compliant — when a piece of Evidence says the work actually happened.
 *
 * WHY THIS EXISTS (Phil, 2026-09-08). He completed the rebuilt Annual Appraisal dated
 * 10/11/26. The record and the check both said 10/11/26. The compliance matrix said
 * 08/09/26, and derived Supervision 1 as due 27/11/26 instead of 29/01/27 -- sixty three
 * days early, on the screen a manager plans the year from.
 *
 * The cause was two rules for one question. SAVING a check reads the date out of the
 * schema: firstDateFieldKey finds the form's first date question whatever it is called.
 * READING it back had the field name typed into the code -- answers.date_of_appraisal,
 * answers.supervision_date, answers.review_date -- and the appraisal rebuild renamed that
 * question to appraisal_date. The lookup found nothing, fell back to the submission
 * timestamp, and said today. Nothing errored. Nothing could error: a missing key in a bag
 * of answers looks exactly like a form that never asked.
 *
 * So the date comes from the SCHEMA on both sides now, and this is the one rule. Rename a
 * date question on any form, on any company's copy, and the two sides still agree.
 *
 * Read against the version the Evidence was actually submitted under, not today's form, so
 * a record filled in two versions ago still reports the date it was filled in with.
 *
 * Pure and self-contained (no runtime imports) so it can be unit tested.
 */

/** A field as it appears in a stored form schema. Structural, so this module needs no
 *  import of the form types and stays testable on its own. */
type SchemaLike = {
  sections?: Array<{ fields?: Array<{ key?: unknown; type?: unknown }> }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The key of the first date question in a schema, which is the question that asks when the
 * thing happened: Date of supervision, Date of appraisal, Date of review.
 *
 * The same choice firstDateFieldKey makes on the saving side, made here from a stored
 * schema of unknown shape rather than a parsed one.
 */
export function dateKeyOf(schema: unknown): string | null {
  const sections = (schema as SchemaLike | null)?.sections;
  if (!Array.isArray(sections)) return null;
  for (const section of sections) {
    const fields = section?.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (field?.type === "date" && typeof field.key === "string" && field.key) return field.key;
    }
  }
  return null;
}

/**
 * When the Evidence says the work happened: the answer to the form's date question, or the
 * day it was submitted when the form did not ask or the answer is not a date.
 *
 * The fallback is deliberate and unchanged -- a form with no date question is completed on
 * the day it is filled in -- but it is now reached only when the form really did not ask,
 * rather than whenever somebody renamed the question.
 */
export function completionDate(
  answers: Record<string, unknown> | null | undefined,
  submittedAt: string,
  dateKey: string | null,
): string {
  if (dateKey) {
    const answer = answers?.[dateKey];
    if (typeof answer === "string" && ISO_DATE.test(answer)) return answer;
  }
  return submittedAt.slice(0, 10);
}

/** The date key for each form version, so a page of Evidence can be read in one pass. */
export function dateKeysByVersion(
  versions: ReadonlyArray<{ id: string; schema: unknown }>,
): Map<string, string | null> {
  return new Map(versions.map((v) => [v.id, dateKeyOf(v.schema)]));
}

/**
 * The completion dates for a set of Evidence rows, in the order given, using each row's own
 * version to decide which answer holds the date.
 */
export function completionDates(
  rows: ReadonlyArray<{
    submitted_at: string;
    answers: Record<string, unknown> | null;
    form_version_id?: string | null;
  }>,
  keysByVersion: ReadonlyMap<string, string | null>,
): string[] {
  return rows.map((row) =>
    completionDate(row.answers, row.submitted_at, keysByVersion.get(row.form_version_id ?? "") ?? null),
  );
}

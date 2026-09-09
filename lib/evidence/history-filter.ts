/**
 * Be Care Compliant -- narrowing a record's Evidence to one kind of form.
 *
 * WHY (Phil, 2026-09-09): "add a filter to the pop up supervison, annual appraisal spot etc,
 * so they an just search all of one thing if needed." A record that has been running two years
 * has every supervision, spot check, appraisal, audit and competency assessment in one list,
 * newest first. The question somebody actually arrives with is never "what happened lately" --
 * it is "show me the supervisions", because an inspector asked for them or because they are
 * checking a gap.
 *
 * Grouped by the form's NAME as the Evidence recorded it, not by form id or key: Evidence is
 * immutable and keeps the name it was filed under, so a form renamed last year still groups
 * with its own history rather than splitting in two under a name nobody recognises.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

export type EvidenceRowLike = {
  form_name?: string | null;
};

/** The value used for "everything", which is never a real form name. */
export const ALL_FORMS = "";

/** Anything with no form name at all still has to be findable. */
export const UNNAMED = "Evidence";

export type FormOption = { name: string; count: number };

/** The forms this record actually has Evidence for, alphabetical, each with its count. */
export function formOptions(rows: ReadonlyArray<EvidenceRowLike>): FormOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = (row.form_name ?? "").trim() || UNNAMED;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The rows for one form name, in the order given. ALL_FORMS returns everything. */
export function filterByForm<T extends EvidenceRowLike>(
  rows: ReadonlyArray<T>,
  name: string,
): T[] {
  if (!name) return [...rows];
  return rows.filter((r) => ((r.form_name ?? "").trim() || UNNAMED) === name);
}

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
  /** The filter heading this row sits under, when it is not its own form name. Everything done
   *  in the back office is one "Back office" heading (see backOfficeGroup). */
  group?: string | null;
};

/**
 * ONE HEADING FOR THE BACK OFFICE (Phil, 2026-10-06): "If it was done in back office for any
 * subject, whether it's absence, holiday, complaints, incidents, whistleblowing, doesn't matter
 * what it is, let's just call it back office. Otherwise ... we'll have as many things in this
 * drop down as we do in the actual evidence." The row keeps its own name; only the filter groups.
 */
export const BACK_OFFICE = "Back office";

/** The heading the kept absence meeting invitation letters sit under (Phil, 2026-10-06:
 *  "absence meeting invitation should be classed as absence ... one thing in absence"). */
export const ABSENCE = "Absence";

/**
 * BACK_OFFICE only for a form that IS a back office form (absence back office, holiday back
 * office and so on, any key with "back_office" in it). Phil, 2026-10-06, correcting the first
 * attempt: "only absence back office items should be back office". Every other form, meeting
 * records, complaints and incidents included, keeps its own name.
 */
export function backOfficeGroup(formKey: string | null | undefined): string | null {
  const key = (formKey ?? "").trim().toLowerCase();
  return key.includes("back_office") ? BACK_OFFICE : null;
}

function groupOf(row: EvidenceRowLike): string {
  return (row.group ?? "").trim() || (row.form_name ?? "").trim() || UNNAMED;
}

/** Newest first: by the day shown, then by the moment it was filed, so two things on the same
 *  day still come latest first. */
export function newestFirst<T extends { submitted_at: string }>(
  rows: ReadonlyArray<T>,
  shownDay: (row: T) => string,
): T[] {
  return [...rows].sort(
    (a, b) => shownDay(b).localeCompare(shownDay(a)) || b.submitted_at.localeCompare(a.submitted_at),
  );
}

/** The value used for "everything", which is never a real form name. */
export const ALL_FORMS = "";

/** Anything with no form name at all still has to be findable. */
export const UNNAMED = "Evidence";

export type FormOption = { name: string; count: number };

/** The forms this record actually has Evidence for, alphabetical, each with its count. */
export function formOptions(rows: ReadonlyArray<EvidenceRowLike>): FormOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = groupOf(row);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The rows under one heading (a form name, or Back office), in the order given. ALL_FORMS returns everything. */
export function filterByForm<T extends EvidenceRowLike>(
  rows: ReadonlyArray<T>,
  name: string,
): T[] {
  if (!name) return [...rows];
  return rows.filter((r) => groupOf(r) === name);
}

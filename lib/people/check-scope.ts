/**
 * Be Care Compliant -- whose record a check belongs on.
 *
 * WHY (Phil, 2026-09-08, of Lead the Leader): it "will only sit on the name card of
 * supervisor and above". Migration 0253 stops the INSTANCE being created for anybody else,
 * which is the half that matters for compliance -- nobody is measured against a check that
 * is not theirs. But the record page lists every DEFINITION and shows "Not applied" where
 * there is no instance, so a care assistant's card still carried a Lead the Leader tile
 * telling them a leadership supervision had not been applied to them. It is not missing.
 * It is not theirs.
 *
 * Same rule as the database: no job titles named means everybody, and a title is matched
 * trimmed and case insensitively, because a job title is typed by a person.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** Only the part of a check definition this rule reads. */
export type TitleScoped = { job_titles?: string[] | null };

/** Does a check belong on the record of somebody with this job title? */
export function checkAppliesToTitle(
  def: TitleScoped,
  jobTitle: string | null | undefined,
): boolean {
  const titles = def.job_titles;
  if (!titles || titles.length === 0) return true;
  const theirs = (jobTitle ?? "").trim().toLowerCase();
  if (!theirs) return false;
  return titles.some((t) => (t ?? "").trim().toLowerCase() === theirs);
}

/** The checks that belong on this person's record, in the order given. */
export function checksForTitle<T extends TitleScoped>(
  defs: ReadonlyArray<T>,
  jobTitle: string | null | undefined,
): T[] {
  return defs.filter((d) => checkAppliesToTitle(d, jobTitle));
}

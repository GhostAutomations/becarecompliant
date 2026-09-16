/**
 * Be Care Compliant — the job title a bulk imported Person lands on.
 *
 * Phil, 2026-09-16: "if the upload is blank, default blank to care assistant". A People
 * sheet with the Job title column left empty is the normal case for an agency whose staff
 * are almost all carers, and a Person with NO job title is worse than one with a plausible
 * one: checksForTitle scopes a record's checks by title, and a blank matches nothing that
 * names titles at all.
 *
 * The company's OWN spelling wins where it has one. Care Assistant is the first job title
 * both seeded companies carry, but a company that writes it "Care assistant" should get its
 * own casing rather than a second, nearly identical title appearing in its register and on
 * the dropdown as "(not in your list)". Only when the company has nothing resembling it
 * does the plain constant go in.
 *
 * A title the sheet DOES give is never touched, not even to correct its case: that is the
 * importer's data, and quietly rewriting what somebody typed is how you lose a real title
 * like "Care Assistant (Nights)".
 *
 * Pure and import free so it can be unit tested.
 */

export const DEFAULT_JOB_TITLE = "Care Assistant";

export function jobTitleOrDefault(
  raw: string | null | undefined,
  companyTitles: readonly string[] = [],
): string {
  const given = (raw ?? "").trim();
  if (given) return given;
  const match = companyTitles.find(
    (t) => (t ?? "").trim().toLowerCase() === DEFAULT_JOB_TITLE.toLowerCase(),
  );
  return (match ?? DEFAULT_JOB_TITLE).trim();
}

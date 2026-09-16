/**
 * Be Care Compliant — who is still in probation, for the Training matrix's two groups.
 *
 * Phil, 2026-09-16, of the Monday training board: "while in probation on the People Matrix,
 * they sit in the probation matrix on the training matrix, when passed probation, they move
 * to the main group."
 *
 * WHY IT MATTERS ON TRAINING SPECIFICALLY. A new starter is red on nearly every course for the
 * first few weeks, which is not a failure, it is somebody who started on Monday. Mixed in with
 * the established team their red drags the eye and hides the reds that are real. Grouping them
 * separates "has not done it yet" from "has let it lapse".
 *
 * DERIVED, NEVER SET BY HAND. Monday's grouping is a column somebody drags a row between, so it
 * goes stale: their board still lists a carer under In Probation whose probation passed months
 * ago. Reading probation_status means passing probation moves the row on its own.
 *
 * STILL IN PROBATION: 'due' (running) and 'extended' (running, on a longer leash). OUT: 'passed'
 * and 'failed'. A record with NO status is treated as out: every carer added through the product
 * gets 'due' on creation, so a blank means an imported or older record, and sweeping those into
 * a probation group nobody put them in would be worse than leaving them with the team.
 *
 * Pure and import free so it can be unit tested.
 */

export function inProbation(probationStatus: string | null | undefined): boolean {
  const s = (probationStatus ?? "").trim().toLowerCase();
  return s === "due" || s === "extended";
}

/**
 * Split a list into the ones still in probation and the rest, keeping the order given.
 * `probation` being empty is the signal to show no groups at all: a company with nobody in
 * probation should see the plain register it has always seen, not an empty heading.
 */
export function splitByProbation<T>(
  items: readonly T[],
  statusOf: (item: T) => string | null | undefined,
): { probation: T[]; team: T[] } {
  const probation: T[] = [];
  const team: T[] = [];
  for (const i of items) (inProbation(statusOf(i)) ? probation : team).push(i);
  return { probation, team };
}

/**
 * Does this COURSE belong on the record of somebody with this job title?
 *
 * Phil, 2026-09-16: Assessing Needs, Care Planning, Risk Assessment and Supervision and
 * Appraisal are done by "supervisors and above". Until courses could be scoped, all four sat
 * red on every carer: sixty five red cells for training twelve of the thirteen are not meant
 * to hold. Red that means nothing is worse than no column at all, because it teaches people
 * to ignore red.
 *
 * The SAME rule as checkAppliesToTitle (lib/people/check-scope.ts) and the same as the SQL:
 * no titles named means everybody, and a title is matched trimmed and case insensitively
 * because a job title is typed by a person. A person with NO job title gets only the courses
 * that name nobody, which is why a blank on import now defaults to Care Assistant.
 */
export function courseAppliesToTitle(
  courseJobTitles: readonly string[] | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  if (!courseJobTitles || courseJobTitles.length === 0) return true;
  const theirs = (jobTitle ?? "").trim().toLowerCase();
  if (!theirs) return false;
  return courseJobTitles.some((t) => (t ?? "").trim().toLowerCase() === theirs);
}


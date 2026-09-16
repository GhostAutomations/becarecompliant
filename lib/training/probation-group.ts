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

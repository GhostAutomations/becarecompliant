/**
 * Be Care Compliant — what the DBS card says while somebody works on a DBS Pending Risk
 * Assessment. Pure and IMPORTLESS, so node --test can load it.
 *
 * Phil, 2026-10-05 (popup): "A completed Pending assessment shows Working on DBS pending in amber
 * until the DBS date of issue is entered, then clears itself. Weekly reviews are prompted while
 * it's open." Nothing is stored for this: it is read from the latest Pending Evidence and the
 * record's DBS date every time, so it can never be left behind once the certificate is in.
 */

export type DbsPendingInput = {
  /** The latest DBS Pending Risk Assessment's answers, or null when there is none. */
  latest: { decision?: unknown; review_date?: unknown } | null;
  /** person_trackers.dbs_date: the certificate's date of issue. */
  dbsDate: string | null;
  /** Today, ISO, Europe/London. */
  todayIso: string;
};

export type DbsPendingState = {
  /** "start": working under safeguards. "wait": told to wait for the certificate. */
  decision: "start" | "wait";
  /** The next review, when they are working. */
  reviewDue: string | null;
  /** amber while the review is in date, red once it is missed. */
  rag: "amber" | "red";
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function dbsPendingState(input: DbsPendingInput): DbsPendingState | null {
  if (!input.latest) return null;
  // The certificate is in: the assessment has done its job.
  if (input.dbsDate && ISO.test(input.dbsDate)) return null;
  const decision = input.latest.decision === "start" ? "start" : "wait";
  const review = typeof input.latest.review_date === "string" && ISO.test(input.latest.review_date)
    ? input.latest.review_date
    : null;
  if (decision === "wait") return { decision, reviewDue: null, rag: "amber" };
  return { decision, reviewDue: review, rag: review && review < input.todayIso ? "red" : "amber" };
}

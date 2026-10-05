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
  latest: { decision?: unknown; review_date?: unknown; dbs_applied_on?: unknown } | null;
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
  /* The certificate is in: the assessment has done its job. "In" means a date of issue on or after
     the date the DBS was applied for (a certificate is often issued days before it arrives, so the
     assessment date would be wrong here). An OLDER certificate on file is the one being replaced
     (a renewal), so the assessment is still in force. */
  const applied = typeof input.latest.dbs_applied_on === "string" && ISO.test(input.latest.dbs_applied_on)
    ? input.latest.dbs_applied_on
    : null;
  if (input.dbsDate && ISO.test(input.dbsDate) && (!applied || input.dbsDate >= applied)) return null;
  const decision = input.latest.decision === "start" ? "start" : "wait";
  const review = typeof input.latest.review_date === "string" && ISO.test(input.latest.review_date)
    ? input.latest.review_date
    : null;
  if (decision === "wait") return { decision, reviewDue: null, rag: "amber" };
  return { decision, reviewDue: review, rag: review && review < input.todayIso ? "red" : "amber" };
}

/**
 * THE "DBS RISK" REGISTER COLUMN (Phil, 2026-10-05, popups). A marker, never a date: neither
 * assessment expires (CQC: the assessment is made at the decision to employ; no set review
 * period), so there is nothing to count down to.
 *   Pending   a DBS Pending Risk Assessment is in force: no date of issue on file yet. Amber,
 *             red once its weekly review is missed (the same rule as the DBS card).
 *   Assessed  a DBS Disclosure Risk Assessment covers the CURRENT certificate. A later date of
 *             issue means a new certificate, so the marker clears; the old form stays as
 *             Evidence and a new certificate that shows something needs a new assessment.
 *   null      neither.
 */
export type DbsRiskMarker = { label: "Pending" | "Assessed"; tone: "amber" | "red" | "neutral" };

export function dbsRiskMarker(input: {
  latestPending: { decision?: unknown; review_date?: unknown; dbs_applied_on?: unknown } | null;
  latestDisclosure: { cert_issue_date?: unknown } | null;
  dbsDate: string | null;
  todayIso: string;
}): DbsRiskMarker | null {
  const pending = dbsPendingState({ latest: input.latestPending, dbsDate: input.dbsDate, todayIso: input.todayIso });
  if (pending) return { label: "Pending", tone: pending.rag };
  const d = input.latestDisclosure;
  if (!d) return null;
  const certOnForm = typeof d.cert_issue_date === "string" && ISO.test(d.cert_issue_date) ? d.cert_issue_date : null;
  const current = input.dbsDate && ISO.test(input.dbsDate) ? input.dbsDate : null;
  // No certificate on the record yet: the assessment is the only certificate we know about.
  if (!current) return { label: "Assessed", tone: "neutral" };
  // A form that does not say which certificate cannot be matched to one; it covers what is there.
  if (!certOnForm) return { label: "Assessed", tone: "neutral" };
  return certOnForm >= current ? { label: "Assessed", tone: "neutral" } : null;
}

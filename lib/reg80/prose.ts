/**
 * Be Care Compliant — the Regulation 80 incident, safeguarding and whistleblowing
 * sentences.
 *
 * PURE, AND WITH NO RUNTIME IMPORTS AT ALL (the type imports below are erased), so this
 * runs under `node --experimental-strip-types`, which resolves neither path aliases nor
 * extensionless imports. That is the whole reason these sentences live here rather than
 * inline in spec.ts: they end up in a document a regulator reads, and they are worth
 * testing directly.
 *
 * They exist in this form because of what the first live Reg 80 draft actually said:
 *
 *   "1 incidents occurred at Cardiff1 between 2026-02-12 and 2026-08-12."
 *
 * Two defects in one sentence. The counts were right, the tests were green and tsc was
 * clean; it was visible only in the artefact. The ISO date is the same defect lib/dates.ts
 * was written for on 2026-08-10 after live testing found "Date of Meeting: 2026-07-16" on
 * an inspection record, so the caller now formats the period and passes it in.
 */

import type { Reg80Prefill } from "./prefill";

type Incidents = Reg80Prefill["incidents"];
type Whistleblowing = Reg80Prefill["whistleblowing"];

/** "1 incident" / "2 incidents". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Subject-verb agreement for a counted noun: was/were, has/have, does/do. */
export function agree(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * @param period already formatted for reading, e.g. "between 12 February 2026 and
 * 12 August 2026". Passed in rather than built here so this module stays import free.
 */
export function incidentLines(inc: Incidents, branchName: string, period: string): string[] {
  if (inc.total === 0) {
    return [`No incidents were recorded for ${branchName} ${period}.`];
  }
  return [
    `${count(inc.total, "incident", "incidents")} occurred at ${branchName} ${period}.`,
    inc.notifiable === 0
      ? `None ${agree(inc.total, "was", "were")} notifiable to the regulator.`
      : `${inc.notifiable} of ${agree(inc.total, "those", "them")} ${agree(inc.notifiable, "was", "were")} notifiable to the regulator.`,
    ...(inc.notifiable === 0
      ? []
      : [
          inc.awaitingNotification === 0
            ? `${agree(inc.notified, "It has", "All have")} a notification recorded.`
            : `${count(inc.awaitingNotification, "notification", "notifications")} ${agree(inc.awaitingNotification, "is", "are")} still outstanding.`,
        ]),
    `By category: ${inc.byCategory.map((c) => `${c.category} ${c.count}`).join(", ")}.`,
    `Status at today's date: ${inc.open} open, ${inc.underReview} under review, ${inc.closed} closed.`,
  ];
}

export function safeguardingLines(inc: Incidents): string[] {
  if (inc.total === 0) {
    return ["No incidents were recorded in the period, so no safeguarding matters arose from one."];
  }
  if (inc.safeguarding === 0) {
    return [
      `None of the ${count(inc.total, "incident", "incidents")} in the period ${agree(inc.total, "was", "were")} escalated to safeguarding.`,
    ];
  }
  /* "1 of the 1 incident in the period was escalated" is grammatical and reads like a
     machine wrote it, which in a Reg 80 report is its own kind of wrong. When every
     incident was escalated, say so. */
  const escalated =
    inc.safeguarding === inc.total
      ? inc.total === 1
        ? "The incident in the period was escalated to safeguarding."
        : `All ${count(inc.total, "incident", "incidents")} in the period were escalated to safeguarding.`
      : `${inc.safeguarding} of the ${count(inc.total, "incident", "incidents")} in the period ${agree(inc.safeguarding, "was", "were")} escalated to safeguarding.`;
  return [
    escalated,
    inc.awaitingReferral === 0
      ? `${agree(inc.referred, "It has", "All have")} a referral date recorded.`
      : `${inc.referred} ${agree(inc.referred, "has", "have")} a referral date recorded and ${inc.awaitingReferral} ${agree(inc.awaitingReferral, "does", "do")} not.`,
  ];
}

/**
 * NULL, NOT A ZERO SENTENCE, when this reader may not see the register.
 *
 * A branch manager can author a Reg 80 review and cannot read whistleblowing disclosures.
 * Returning "no disclosures were received in the period" for them would put a confident
 * falsehood into a report that goes to CIW. Null leaves the field absent, which also means
 * a Refresh by that person leaves whatever the Responsible Individual wrote alone.
 */
export function whistleblowingLines(
  wb: Whistleblowing,
  branchName: string,
  period: string,
): string[] | null {
  if (!wb.readable) return null;
  if (wb.total === 0) return [`No whistleblowing disclosures were received ${period}.`];
  return [
    `${count(wb.total, "whistleblowing disclosure", "whistleblowing disclosures")} ${agree(wb.total, "was", "were")} received ${period}.`,
    `Recorded company wide: disclosures are not held against a branch, so this covers the whole company and not ${branchName} alone.`,
    wb.anonymous === 0
      ? "None were made anonymously."
      : `${wb.anonymous} ${agree(wb.anonymous, "was", "were")} made anonymously.`,
    `By category: ${wb.byCategory.map((c) => `${c.category} ${c.count}`).join(", ")}.`,
    `Status at today's date: ${wb.open} open, ${wb.underReview} under review, ${wb.closed} closed` +
      (wb.medianDaysToClose === null
        ? "."
        : `, typically closed in ${count(wb.medianDaysToClose, "day", "days")}.`),
  ];
}

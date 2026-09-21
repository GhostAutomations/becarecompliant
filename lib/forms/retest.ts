/**
 * Be Care Compliant — an answer that brings the next one forward.
 *
 * Phil, 2026-09-19: "If a spot check is failed a new one should be done within 7 days." The
 * failed visit still counts as done (it happened), but the next one is due in a week, not in the
 * usual 28 days.
 *
 * Written on the QUESTION in the form's schema, not in code about spot checks: a field carrying
 * `retestWithin` says "answered with one of these, the next is due this many days after this
 * completion". So any form can use it, every Evidence freezes it with the questions, and it is
 * the default for every company because it is part of the form.
 *
 * Pure and importless at runtime, so it is unit tested.
 */

import type { Answers, FormSchema } from "../form-schema.ts";

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The retest date this completion calls for, or null when no answer calls for one. The
 *  soonest wins when several do. */
export function retestDue(schema: FormSchema, answers: Answers, completedOnIso: string): string | null {
  let soonest: string | null = null;
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) {
      const rule = field.retestWithin;
      if (!rule || !(rule.days > 0)) continue;
      const v = answers[field.key];
      const answer = typeof v === "string" ? v : typeof v === "boolean" ? (v ? "yes" : "no") : null;
      if (answer === null || !rule.when.includes(answer)) continue;
      const due = addDays(completedOnIso, rule.days);
      if (soonest === null || due < soonest) soonest = due;
    }
  }
  return soonest;
}

/** The next due date once a retest is taken into account: whichever comes first. */
export function withRetest(nextDue: string | null, retest: string | null): string | null {
  if (!retest) return nextDue;
  if (!nextDue) return retest;
  return retest < nextDue ? retest : nextDue;
}

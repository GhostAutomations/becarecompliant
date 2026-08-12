/**
 * Be Care Compliant — Incident aggregation. PURE: no imports with side effects, no
 * Supabase, no dates from the environment. Everything it needs is passed in, so it
 * runs under `node --test` and produces the same answer on the server, in the
 * browser and in the Reg 80 report.
 *
 * This is the module the Regulation 80(3)(b) aggregate will be built from, so the
 * counting rules live here once rather than being written a second time in the
 * report and drifting.
 */

import type { IncidentRecord, IncidentStatus } from "./types";

/** The fields the summary actually reads. Anything with these can be counted,
 *  which keeps the tests free of full record fixtures. */
export type CountableIncident = {
  occurred_on: string;
  category: string;
  notifiable: boolean;
  notified_on: string | null;
  safeguarding: boolean;
  safeguarding_referred_on: string | null;
  status: IncidentStatus;
};

export type IncidentSummary = {
  total: number;
  /** Flagged as notifiable to the regulator. */
  notifiable: number;
  /** Notifiable AND a notification date recorded. */
  notified: number;
  /** Flagged as notifiable with NO notification date. The one number a manager
   *  should act on today: the duty was identified and then not discharged. */
  awaitingNotification: number;
  /** Escalated to safeguarding. */
  safeguarding: number;
  /** Escalated AND a referral date recorded. */
  referred: number;
  /** Escalated with no referral date recorded. */
  awaitingReferral: number;
  open: number;
  underReview: number;
  closed: number;
  /** Categories present, commonest first, ties broken alphabetically so the order
   *  is stable between runs and between the screen and the report. */
  byCategory: Array<{ category: string; count: number }>;
};

/** True when an ISO date falls inside an inclusive range. A null bound is open ended.
 *  String comparison is safe and cheap for YYYY-MM-DD, and avoids a timezone shifting
 *  a 1 January incident into the previous year. */
export function withinRange(
  iso: string,
  from: string | null = null,
  to: string | null = null,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

const EMPTY: IncidentSummary = {
  total: 0,
  notifiable: 0,
  notified: 0,
  awaitingNotification: 0,
  safeguarding: 0,
  referred: 0,
  awaitingReferral: 0,
  open: 0,
  underReview: 0,
  closed: 0,
  byCategory: [],
};

/**
 * Count a set of incidents, optionally restricted to a date range by the date the
 * incident OCCURRED (not the date it was typed in — a Reg 80 review covers what
 * happened in the period, whenever the paperwork caught up).
 */
export function summariseIncidents(
  rows: readonly CountableIncident[],
  range: { from?: string | null; to?: string | null } = {},
): IncidentSummary {
  const from = range.from ?? null;
  const to = range.to ?? null;
  const out: IncidentSummary = { ...EMPTY, byCategory: [] };
  const categories = new Map<string, number>();

  for (const row of rows) {
    if (!withinRange(row.occurred_on, from, to)) continue;
    out.total += 1;

    if (row.notifiable) {
      out.notifiable += 1;
      if (row.notified_on) out.notified += 1;
      else out.awaitingNotification += 1;
    }

    if (row.safeguarding) {
      out.safeguarding += 1;
      if (row.safeguarding_referred_on) out.referred += 1;
      else out.awaitingReferral += 1;
    }

    if (row.status === "open") out.open += 1;
    else if (row.status === "under_review") out.underReview += 1;
    else if (row.status === "closed") out.closed += 1;

    const category = (row.category ?? "").trim() || "Other";
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }

  out.byCategory = [...categories.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => (b.count - a.count) || a.category.localeCompare(b.category));

  return out;
}

/**
 * The incidents needing action before anything else: a notifiable incident with no
 * notification date, or a safeguarding escalation with no referral date. Order is
 * oldest first, because the oldest is the one that has been outstanding longest.
 */
export function needsAction<T extends CountableIncident>(rows: readonly T[]): T[] {
  return rows
    .filter(
      (r) =>
        (r.notifiable && !r.notified_on) ||
        (r.safeguarding && !r.safeguarding_referred_on),
    )
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

/** Narrow a full record set for the summary without copying every field. */
export function countable(rows: readonly IncidentRecord[]): CountableIncident[] {
  return rows.map((r) => ({
    occurred_on: r.occurred_on,
    category: r.category,
    notifiable: r.notifiable,
    notified_on: r.notified_on,
    safeguarding: r.safeguarding,
    safeguarding_referred_on: r.safeguarding_referred_on,
    status: r.status,
  }));
}

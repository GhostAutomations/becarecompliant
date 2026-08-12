/**
 * Be Care Compliant — Whistleblowing aggregation. PURE: no imports with side effects,
 * no Supabase, no ambient dates. Runs under `node --test`, and gives the same answer on
 * the screen and in the Regulation 80 report.
 *
 * Reg 80(3)(b) asks for the disclosures RECEIVED in the review period and what came of
 * them. It does not ask for, and must not be given, anything that identifies a discloser.
 */

import type { DisclosureRecord, DisclosureStatus } from "./types";

export type CountableDisclosure = {
  received_on: string;
  category: string;
  anonymous: boolean;
  status: DisclosureStatus;
  closed_on: string | null;
};

export type DisclosureSummary = {
  total: number;
  anonymous: number;
  named: number;
  open: number;
  underReview: number;
  closed: number;
  /** Closed within the period, with a closed_on date — what "resolved" can be evidenced as. */
  byCategory: Array<{ category: string; count: number }>;
  /** Median days from received to closed, over the closed disclosures that have both dates.
   *  Median rather than mean: one disclosure that took a year should not be able to make
   *  eleven prompt ones look slow, and a provider quoting this figure has to stand behind it. */
  medianDaysToClose: number | null;
};

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

/** Whole days between two ISO dates, or null if either is unusable or the pair is
 *  backwards. A negative duration is a data entry error, not a fast resolution. */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(from) || !/^\d{4}-\d{2}-\d{2}/.test(to)) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86_400_000);
  return days < 0 ? null : days;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summariseDisclosures(
  rows: readonly CountableDisclosure[],
  range: { from?: string | null; to?: string | null } = {},
): DisclosureSummary {
  const from = range.from ?? null;
  const to = range.to ?? null;
  const out: DisclosureSummary = {
    total: 0,
    anonymous: 0,
    named: 0,
    open: 0,
    underReview: 0,
    closed: 0,
    byCategory: [],
    medianDaysToClose: null,
  };
  const categories = new Map<string, number>();
  const durations: number[] = [];

  for (const row of rows) {
    if (!withinRange(row.received_on, from, to)) continue;
    out.total += 1;
    if (row.anonymous) out.anonymous += 1;
    else out.named += 1;

    if (row.status === "open") out.open += 1;
    else if (row.status === "under_review") out.underReview += 1;
    else if (row.status === "closed") {
      out.closed += 1;
      const days = daysBetween(row.received_on, row.closed_on);
      if (days !== null) durations.push(days);
    }

    const category = (row.category ?? "").trim() || "Other";
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }

  out.byCategory = [...categories.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => (b.count - a.count) || a.category.localeCompare(b.category));
  out.medianDaysToClose = median(durations);

  return out;
}

export function countable(rows: readonly DisclosureRecord[]): CountableDisclosure[] {
  return rows.map((r) => ({
    received_on: r.received_on,
    category: r.category,
    anonymous: r.anonymous,
    status: r.status,
    closed_on: r.closed_on,
  }));
}

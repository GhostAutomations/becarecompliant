/**
 * Be Care Compliant: past personal outcomes and past outcome updates (Phil, 2026-10-13,
 * docs/decisions/historic-outcomes.md).
 *
 * For a limited time a company may add an outcome that began in the past (From and To, To being
 * the target date) and an update dated in the past. Each such entry is marked as entered later.
 * This module holds the rules, so the server actions, the screens and the PQS period figure all
 * read dates the same way:
 *
 *   An outcome began on its From date, else the London date it was added.
 *   An update speaks for its own date, else the London date it was added.
 *   A PQS period's outcomes figure is the position on the period's last day (Phil, popup): every
 *   outcome begun by then, with the progress it had on that day. A period ending today is exactly
 *   today's figure. A discharged service user counts in a past period when they were still
 *   receiving a service on its last day (Phil, popup).
 *
 * Pure and importless apart from outcome-consts, so node --test can load it.
 */

import type { OutcomeStatus } from "./outcome-consts.ts";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The London calendar date of a stored timestamp. */
export function londonDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
}

/** dd/mm/yyyy, the way the screens print a date. */
export function ukDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "";
}

/**
 * A stored timestamp for a past date: midday UTC, which is the same calendar date in London in
 * winter and summer, so every reader that takes the first ten characters reads the right day.
 */
export function middayOf(isoDate: string): string {
  return `${isoDate}T12:00:00+00:00`;
}

/** The day an outcome began. */
export function outcomeFrom(o: { start_date: string | null; created_at: string }): string {
  return o.start_date ?? londonDate(o.created_at);
}

/** The day an update speaks for. */
export function updateDate(u: { dated_on: string | null; created_at: string }): string {
  return u.dated_on ?? londonDate(u.created_at);
}

/** Oldest first by the day each update speaks for; the same day in the order they were added. */
export function sortUpdates<T extends { dated_on: string | null; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = updateDate(a);
    const db = updateDate(b);
    if (da !== db) return da < db ? -1 : 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/** Whether the company's window for past entries is open today (the until date included). */
export function historicWindowOpen(until: string | null | undefined, todayIso: string): boolean {
  return isIsoDate(until) && todayIso <= until;
}

/** The line that marks an entry as added after the fact. */
export function enteredLaterLine(addedAtIso: string, byName: string | null, datedIso: string): string {
  const by = String(byName ?? "").trim();
  return `Added on ${ukDate(londonDate(addedAtIso))}${by ? ` by ${by}` : ""}, dated ${ukDate(datedIso)}`;
}

/** Checks a past outcome's dates. Null when they are fine, else what to tell the person. */
export function pastOutcomeError(i: {
  from: string;
  to: string | null;
  todayIso: string;
  /** The service user's discharge date, when they have left. */
  dischargeDate: string | null;
}): string | null {
  if (!isIsoDate(i.from)) return "Choose the date the outcome began (From).";
  if (i.from > i.todayIso) return "The From date cannot be in the future.";
  if (i.dischargeDate && i.from > i.dischargeDate) {
    return `This person was discharged on ${ukDate(i.dischargeDate)}, so the outcome must begin on or before then.`;
  }
  if (i.to !== null) {
    if (!isIsoDate(i.to)) return "That To date is not a date the calendar recognises.";
    if (i.to < i.from) return "The To date cannot be before the From date.";
  }
  return null;
}

export type TimelineUpdate = {
  kind: string;
  progress: string | null;
  dated_on: string | null;
  created_at: string;
};

/**
 * Checks the date an outcome is CLOSED on, Achieved or Not achieved (Phil, 2026-10-14). Not in the
 * future, not before the outcome began, not before its latest dated update, and for a discharged
 * person not after their discharge. Null when it is fine.
 */
export function closeDateError(i: {
  date: string;
  todayIso: string;
  outcomeFromIso: string;
  dischargeDate: string | null;
  existing: TimelineUpdate[];
}): string | null {
  if (!isIsoDate(i.date)) return "Choose the date the outcome was closed.";
  if (i.date > i.todayIso) return "The date it was closed cannot be in the future.";
  if (i.date < i.outcomeFromIso) {
    return `The outcome began on ${ukDate(i.outcomeFromIso)}, so it cannot be closed before then.`;
  }
  const latest = latestDate(i.existing);
  if (latest && i.date < latest) {
    return `The outcome has an update dated ${ukDate(latest)}, so it cannot be closed before then.`;
  }
  if (i.dischargeDate && i.date > i.dischargeDate) {
    return `This person was discharged on ${ukDate(i.dischargeDate)}, so the outcome must be closed on or before then.`;
  }
  return null;
}

/** Checks a past update's date against its outcome. Null when it is fine. */
export function pastUpdateError(i: {
  date: string;
  todayIso: string;
  outcomeFromIso: string;
  /** The day the outcome was achieved, when it has been. */
  achievedOn: string | null;
  dischargeDate: string | null;
  /** True when the past update marks the outcome achieved. */
  marksAchieved: boolean;
  existing: TimelineUpdate[];
  /** How the outcome was closed, for the wording; achieved when left out. */
  closedAs?: "achieved" | "not_achieved";
}): string | null {
  if (!isIsoDate(i.date)) return "Choose the date of the update.";
  if (i.date > i.todayIso) return "The update's date cannot be in the future.";
  if (i.date < i.outcomeFromIso) {
    return `An update cannot be dated before the outcome began (${ukDate(i.outcomeFromIso)}).`;
  }
  if (i.dischargeDate && i.date > i.dischargeDate) {
    return `This person was discharged on ${ukDate(i.dischargeDate)}, so the update must be dated on or before then.`;
  }
  if (i.achievedOn) {
    const word = i.closedAs === "not_achieved" ? "closed as not achieved" : "achieved";
    if (i.marksAchieved) return i.closedAs === "not_achieved" ? "This outcome is already closed." : "This outcome is already achieved.";
    if (i.date > i.achievedOn) {
      return `This outcome was ${word} on ${ukDate(i.achievedOn)}, so a past update must be dated on or before then.`;
    }
  }
  if (i.marksAchieved) {
    const latest = latestDate(i.existing);
    if (latest && i.date < latest) {
      return `The outcome has an update dated ${ukDate(latest)}, so it cannot be marked achieved before then.`;
    }
  }
  return null;
}

function latestDate(list: TimelineUpdate[]): string | null {
  let best: string | null = null;
  for (const u of list) {
    const d = updateDate(u);
    if (best === null || d > best) best = d;
  }
  return best;
}

/**
 * Whether a past update dated `date` becomes the outcome's latest, and so sets its status. It does
 * when nothing already on the outcome speaks for a later day (the same day: the one added last
 * wins, which is the new one). An achieved outcome's status never changes from a past update.
 */
export function pastUpdateIsLatest(existing: TimelineUpdate[], date: string, achieved: boolean): boolean {
  if (achieved) return false;
  const latest = latestDate(existing);
  return latest === null || date >= latest;
}

/** The status one update leaves an outcome in. */
function statusFromUpdate(u: TimelineUpdate): OutcomeStatus {
  if (u.kind === "completed") return "achieved";
  if (u.kind === "not_achieved") return "not_achieved";
  if (u.kind === "reopened") return "working_towards";
  const p = u.progress;
  return p === "progressing" || p === "no_change" || p === "regressing" ? p : "working_towards";
}

/**
 * An outcome's status as it stood at the end of `endIso`. Null when it had not begun by then.
 * A day on or after today is the outcome's status now, so today's figures never move.
 * An outcome with no updates at all keeps the status it carries (the older outcomes set it
 * directly); one whose updates all come later was still being worked towards.
 */
export function statusAsAt(
  o: { status: OutcomeStatus; start_date: string | null; created_at: string },
  updates: TimelineUpdate[],
  endIso: string,
  todayIso: string,
): OutcomeStatus | null {
  if (endIso >= todayIso) return o.status;
  if (outcomeFrom(o) > endIso) return null;
  if (updates.length === 0) return o.status;
  const upTo = sortUpdates(updates).filter((u) => updateDate(u) <= endIso);
  if (upTo.length === 0) return "working_towards";
  return statusFromUpdate(upTo[upTo.length - 1]);
}

/**
 * The statuses of a service user still receiving a service (Phil, 2026-10-13): someone in hospital
 * or on respite still counts in registers, rollups and reports; only a discharge (cancelled) ends it.
 * A removed record (archived) never counts, whatever its status.
 */
export const RECEIVING_SERVICE = ["active", "hospital", "respite"] as const;

/**
 * Whether a service user counts in the outcomes figure for a period ending `endIso`. Today and
 * later: receiving a service today, as the register counts them. A past day: also a service user
 * discharged after that day (a discharge also archives the record, so that is allowed for them).
 */
export function countsOn(
  su: { service_status: string; discharge_date: string | null; archived_at: string | null },
  endIso: string,
  todayIso: string,
): boolean {
  if ((RECEIVING_SERVICE as readonly string[]).includes(su.service_status)) return su.archived_at === null;
  if (endIso >= todayIso) return false;
  return su.service_status === "cancelled" && !!su.discharge_date && su.discharge_date > endIso;
}

/**
 * The PQS band for Supplier Performance Q2, the outcomes percentage. The sheet (Cardiff SAQ, cycle
 * 2) gives this question its own bands: 85.01 to 100 = 10, 70.01 to 85.00 = 7, 50.01 to 70.00 = 5,
 * 1.00 to 50.00 = 2, 0.00 = 0. The other percentage questions use different ones.
 * The rate is rounded DOWN to two decimals (the sheet's precision), never up, and banded as printed.
 */
export function outcomesPqs(achievingOrProgressing: number, inScope: number): { rate: number | null; band: number | null } {
  if (inScope <= 0) return { rate: null, band: null };
  // In hundredths of a percent, so the band edges compare as whole numbers.
  const h = Math.floor((achievingOrProgressing * 10000) / inScope);
  const band = h >= 8501 ? 10 : h >= 7001 ? 7 : h >= 5001 ? 5 : h >= 100 ? 2 : 0;
  return { rate: h / 100, band };
}

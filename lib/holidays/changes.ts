/**
 * Be Care Compliant — the rules and the wording for changing a holiday (migration 0438).
 *
 * Thistle's request, passed on by Phil on 2026-10-09, and his decisions by popup that day:
 *   - A carer changes an APPROVED holiday: it goes back to pending on the new dates, as a
 *     "Change of holiday". Declined, the dates first agreed come back.
 *   - A carer asks to cancel an APPROVED holiday: pending, as a "Cancellation request".
 *     Declined, it stays booked.
 *   - A carer changes or cancels only BEFORE the holiday starts. From its first day, the office.
 *   - A reason is required for every change and every cancel, by anyone.
 *   - What the office does to a carer's holiday shows at the top of their portal until Got it.
 *
 * The database enforces every one of these (request_holiday_change, request_holiday_cancel,
 * withdraw_holiday_change, decide_holiday_request, amend_holiday_request, cancel_holiday_request).
 * This file only decides what to OFFER and what to SAY, so a button is never shown that the
 * database would refuse.
 *
 * IMPORTLESS, so it is safe in a client component and tested under the repo's type stripping test
 * runner (which resolves no aliases). That is why the date format below is local: it prints exactly
 * what lib/dates.ts ukDate prints, "16 July 2026".
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07-16" becomes "16 July 2026", the same as lib/dates.ts ukDate. */
function ukDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!MONTHS[m - 1] || d < 1 || d > 31) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export type HolidayChangeKind = "amend" | "cancel";

export type HolidayEventKind =
  | "amended"
  | "cancelled"
  | "request_amended"
  | "request_withdrawn"
  | "change_requested"
  | "cancel_requested"
  | "change_withdrawn"
  | "change_approved"
  | "change_declined"
  | "cancel_approved"
  | "cancel_declined";

/** The fields of a holiday these rules need. */
export type HolidayChangeRow = {
  status: string;
  start_date: string;
  end_date: string;
  change_kind?: string | null;
  previous_start_date?: string | null;
  previous_end_date?: string | null;
};

/** One portal notice: something the office did to the carer's holiday. */
export type HolidayNotice = {
  id: string;
  request_id: string;
  kind: string;
  actor_name: string | null;
  old_start_date: string | null;
  old_end_date: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  reason: string | null;
  created_at: string;
};

/** Today's date in London as YYYY-MM-DD, which is the day the database's rules use. */
export function londonTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Has the holiday started, so that only the office may change it now? With a change waiting, the
 * dates first agreed count too: declining it would put the carer back on a holiday already begun.
 */
export function holidayHasStarted(row: HolidayChangeRow, todayIso: string): boolean {
  const agreedStart = row.previous_start_date ?? row.start_date;
  return row.start_date <= todayIso || agreedStart <= todayIso;
}

/** What a carer may do to their own holiday, given its state today. */
export function carerHolidayOptions(
  row: HolidayChangeRow,
  todayIso: string,
): { changeDates: boolean; cancel: boolean; withdrawChange: boolean; started: boolean } {
  const active = row.status === "pending" || row.status === "approved";
  const started = holidayHasStarted(row, todayIso);
  const kind = row.change_kind ?? null;
  return {
    changeDates: active && !started && kind !== "cancel",
    cancel: active && !started && kind !== "cancel",
    // Taking back a change or cancellation request puts the agreed holiday back, which is never
    // harmful, so it stays open however close the dates are.
    withdrawChange: row.status === "pending" && (kind === "amend" || kind === "cancel"),
    started,
  };
}

/** The status a carer sees on their holiday. */
export function holidayStatusLabel(row: HolidayChangeRow): string {
  if (row.status === "pending" && row.change_kind === "amend") return "Change waiting for approval";
  if (row.status === "pending" && row.change_kind === "cancel") return "Cancellation waiting for approval";
  if (row.status === "pending") return "Waiting for approval";
  if (row.status === "approved") return "Approved";
  if (row.status === "declined") return "Declined";
  if (row.status === "cancelled") return "Cancelled";
  return row.status;
}

/** The label the office sees on a change in Pending requests, or null for an ordinary request. */
export function officeChangeLabel(row: HolidayChangeRow): string | null {
  if (row.status !== "pending") return null;
  if (row.change_kind === "amend") return "Change of holiday";
  if (row.change_kind === "cancel") return "Cancellation request";
  return null;
}

function range(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  return start === end ? ukDate(start) : `${ukDate(start)} to ${ukDate(end)}`;
}

/** One line naming a history row, for the subject access export and any history list. */
export function eventKindLabel(kind: string): string {
  switch (kind) {
    case "amended":
      return "Dates changed by the office";
    case "cancelled":
      return "Cancelled by the office";
    case "request_amended":
      return "Request dates changed";
    case "request_withdrawn":
      return "Request withdrawn";
    case "change_requested":
      return "Change of holiday asked for";
    case "cancel_requested":
      return "Cancellation asked for";
    case "change_withdrawn":
      return "Change or cancellation taken back";
    case "change_approved":
      return "Change of holiday approved";
    case "change_declined":
      return "Change of holiday declined";
    case "cancel_approved":
      return "Cancellation approved";
    case "cancel_declined":
      return "Cancellation declined";
    default:
      return kind;
  }
}

/** The heading of a portal notice. */
export function noticeTitle(kind: string): string {
  switch (kind) {
    case "amended":
      return "Your holiday dates have changed";
    case "cancelled":
      return "Your holiday has been cancelled";
    case "change_approved":
      return "Your change of holiday is approved";
    case "change_declined":
      return "Your change of holiday was declined";
    case "cancel_approved":
      return "Your holiday is cancelled, as you asked";
    case "cancel_declined":
      return "Your holiday stays booked";
    default:
      return "Your holiday has changed";
  }
}

/** The sentence under the heading: what the holiday is now, and what it was. */
export function noticeLine(n: Pick<HolidayNotice, "kind" | "old_start_date" | "old_end_date" | "new_start_date" | "new_end_date">): string {
  const was = range(n.old_start_date, n.old_end_date);
  const now = range(n.new_start_date, n.new_end_date);
  switch (n.kind) {
    case "amended":
    case "change_approved":
      return was ? `It now runs from ${now}. It was ${was}.` : `It now runs from ${now}.`;
    case "change_declined":
      return `It stays from ${now}, as first agreed. You had asked for ${was}.`;
    case "cancelled":
    case "cancel_approved":
      return `The holiday from ${was} will not go ahead.`;
    case "cancel_declined":
      return `Your request to cancel was declined, so your holiday from ${was} is still booked.`;
    default:
      return now ? `It now runs from ${now}.` : was ? `It was ${was}.` : "";
  }
}

/** Who did it and when, for the foot of a notice. */
export function noticeByLine(actorName: string | null, createdAtIso: string): string {
  const day = ukDate(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(createdAtIso)),
  );
  return actorName ? `By ${actorName} on ${day}.` : `On ${day}.`;
}

/** The day after a date, in plain calendar arithmetic (no time zones involved). */
export function nextDayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/**
 * The Back at work date a date change starts with (0440): the one the holiday has, while it still
 * falls after the last day; otherwise the day after the last day.
 */
export function backAtWorkFor(endIso: string, currentIso: string | null | undefined): string {
  return currentIso && currentIso > endIso ? currentIso : nextDayIso(endIso);
}

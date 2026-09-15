/**
 * The planner calendar feed, as iCalendar text.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. A subscribed calendar is read by Outlook, not by us, and
 * we never see what it made of the file. So the one thing we CAN prove is that the text we hand
 * over is right, and that only holds if the rules for building it live somewhere a test can
 * reach without a database, a network or a signed-in user.
 *
 * WHAT A NAME COSTS HERE (Phil, 2026-09-15). A feed URL is a password in itself: whoever holds
 * the link reads the calendar, with no login, for as long as the link lives. So the title carries
 * INITIALS, never a service user's full name. A forwarded link then gives away that somebody has
 * a Care Plan Review on Tuesday, not who they are. The full record stays one click away in BCC,
 * behind the login it belongs behind.
 */

export type PlannerFeedEvent = {
  /** The booking id. This is the UID, so an appointment that moves updates instead of doubling. */
  id: string;
  /** What the task is: the check name, or the ad-hoc title. */
  label: string;
  /** Who it is about, in full. Reduced to initials before it reaches the file. */
  subjectName: string | null;
  branchName: string | null;
  /** ISO date, YYYY-MM-DD. */
  scheduledDate: string;
  /** HH:MM, or null for a booking with no time (written as an all-day event). */
  startTime: string | null;
  durationMinutes: number | null;
  status: "planned" | "completed" | "cancelled";
  notes: string | null;
  /** Deep link back to the booking in BCC. */
  url: string | null;
  /** When the booking last changed, for LAST-MODIFIED. */
  updatedAt: string | null;
};

/** A booking with no duration still has to occupy something, or it reads as an all-day job. */
export const DEFAULT_DURATION_MINUTES = 60;

/**
 * Initials from a name: "Mary Jones" -> "M.J.", "Mary-Anne O'Brien Jones" -> "M.O.J.".
 *
 * Hyphenated and apostrophed names are ONE part each, so Mary-Anne is M and not M.A. Anything
 * that leaves no letters at all (a name of punctuation, an empty string) returns null rather
 * than an empty label, so the caller can leave the subject off entirely instead of printing
 * a stray dash.
 */
export function initials(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name
    .split(/[\s]+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  return parts.map((p) => `${p[0].toUpperCase()}.`).join("");
}

/**
 * The line Outlook shows in the diary.
 *
 * "Care Plan Review - M.J. (Cardiff)". The branch is in brackets because somebody covering two
 * branches needs to know where they are going before they open anything, and it is the one part
 * of this that gives nothing away.
 */
export function eventTitle(e: Pick<PlannerFeedEvent, "label" | "subjectName" | "branchName">): string {
  const who = initials(e.subjectName);
  const head = who ? `${e.label} - ${who}` : e.label;
  return e.branchName ? `${head} (${e.branchName})` : head;
}

/** RFC 5545 text escaping: backslash first, or it escapes its own escapes. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets as the spec requires, continuing with a single leading space.
 *
 * Measured in BYTES, not characters: a name with an accent in it is two octets, and folding by
 * character length writes lines Outlook is entitled to reject.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = " ";
      currentBytes = 1;
      limit = 75;
    }
    current += ch;
    currentBytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYYYMMDD from an ISO date, for an all-day DTSTART. */
export function dateValue(iso: string): string {
  return iso.replace(/-/g, "");
}

/** YYYYMMDDTHHMMSS local-to-the-TZID, which is what DTSTART;TZID= wants. */
export function localDateTimeValue(iso: string, time: string): string {
  const [h, m] = time.split(":");
  return `${dateValue(iso)}T${pad2(Number(h))}${pad2(Number(m))}00`;
}

/** The end of a booking, rolling into the next day where it needs to. */
export function endLocalDateTime(iso: string, time: string, minutes: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  return (
    `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}` +
    `T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}00`
  );
}

/** UTC stamp for DTSTAMP / LAST-MODIFIED. */
export function utcStamp(when: Date): string {
  return (
    `${when.getUTCFullYear()}${pad2(when.getUTCMonth() + 1)}${pad2(when.getUTCDate())}` +
    `T${pad2(when.getUTCHours())}${pad2(when.getUTCMinutes())}${pad2(when.getUTCSeconds())}Z`
  );
}

/**
 * Europe/London, written out in full.
 *
 * A booking is a LOCAL time: a supervision at 10:00 is at 10:00 in March and at 10:00 in July,
 * and converting to UTC ourselves means owning British Summer Time and getting it wrong twice a
 * year. Carrying the zone definition in the file hands that job to the calendar, which already
 * knows. The rules are the EU ones London still follows: forward on the last Sunday in March,
 * back on the last Sunday in October, both at 01:00 UTC.
 */
export const LONDON_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "X-LIC-LOCATION:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export type FeedOptions = {
  calendarName: string;
  /** Host part of the UID, so two companies never collide on a booking id. */
  uidDomain: string;
  now: Date;
};

/**
 * One VEVENT.
 *
 * A COMPLETED booking keeps its place in the diary and says so in the description, because the
 * calendar is a record of the day as it happened, not a list of what is left. A CANCELLED one
 * never reaches here at all: it is dropped upstream, so it disappears from Outlook at the next
 * refresh rather than sitting there as a job nobody is doing.
 */
export function buildEvent(e: PlannerFeedEvent, opts: FeedOptions): string[] {
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:planner-${e.id}@${opts.uidDomain}`);
  lines.push(`DTSTAMP:${utcStamp(opts.now)}`);

  if (e.startTime) {
    const minutes = e.durationMinutes && e.durationMinutes > 0 ? e.durationMinutes : DEFAULT_DURATION_MINUTES;
    lines.push(`DTSTART;TZID=Europe/London:${localDateTimeValue(e.scheduledDate, e.startTime)}`);
    lines.push(`DTEND;TZID=Europe/London:${endLocalDateTime(e.scheduledDate, e.startTime, minutes)}`);
  } else {
    // An all-day DTEND is exclusive, so a one-day task ends on the following date.
    const [y, mo, d] = e.scheduledDate.split("-").map(Number);
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    lines.push(`DTSTART;VALUE=DATE:${dateValue(e.scheduledDate)}`);
    lines.push(
      `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`,
    );
  }

  lines.push(`SUMMARY:${escapeText(eventTitle(e))}`);

  /*
   * THE DESCRIPTION IS WHERE THE LINK HAS TO BE (Phil, 2026-09-15: "will they have a link to
   * the task they need to complete?"). Outlook shows DESCRIPTION in the appointment and makes
   * a URL in it clickable; the URL property on its own is not surfaced in most Outlook views,
   * so it is set as well but never relied on. The line is labelled rather than bare, because
   * an unexplained link in a diary entry is one nobody presses.
   */
  const description: string[] = [];
  if (e.status === "completed") description.push("Completed in Be Care Compliant.");
  if (e.notes) description.push(e.notes);
  if (e.url) {
    description.push(
      e.status === "planned"
        ? `Open this task in Be Care Compliant:\n${e.url}`
        : `Open the record in Be Care Compliant:\n${e.url}`,
    );
  }
  if (description.length > 0) lines.push(`DESCRIPTION:${escapeText(description.join("\n\n"))}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.branchName) lines.push(`LOCATION:${escapeText(e.branchName)}`);

  lines.push("STATUS:CONFIRMED");
  lines.push("TRANSP:OPAQUE");
  if (e.updatedAt) {
    const when = new Date(e.updatedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`LAST-MODIFIED:${utcStamp(when)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * The whole file.
 *
 * X-PUBLISHED-TTL and REFRESH-INTERVAL ask for a 15 minute refresh. Apple and most third-party
 * clients honour that; Microsoft ignores it and refreshes on its own schedule, roughly every
 * three hours. They cost nothing and help everyone who is not on Outlook, so they stay.
 */
export function buildPlannerFeed(events: readonly PlannerFeedEvent[], opts: FeedOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Be Care Compliant//Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    `NAME:${escapeText(opts.calendarName)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    ...LONDON_VTIMEZONE,
  ];
  for (const e of events) {
    if (e.status === "cancelled") continue;
    lines.push(...buildEvent(e, opts));
  }
  lines.push("END:VCALENDAR");
  // CRLF between lines is not a style choice: readers are entitled to reject bare newlines.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

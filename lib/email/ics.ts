import "server-only";

/**
 * Minimal iCalendar (.ics) generation for calendar invite emails: the Service
 * User Planned Review invite and the absence management meeting invite (both
 * carried into Phase 6). Events are all-day because the platform stores dates,
 * not times; an all-day VEVENT uses VALUE=DATE with an exclusive DTEND of the
 * next day, which every major client (Apple, Outlook, Google) adds correctly.
 *
 * METHOD:REQUEST plus ORGANIZER/ATTENDEE lines makes clients offer add/RSVP.
 * Attach via Resend with content type "text/calendar; charset=utf-8;
 * method=REQUEST" (see sendEmail attachments).
 */

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** 20260715 from 2026-07-15. */
function basicDate(iso: string): string {
  return iso.replaceAll("-", "");
}

/** Exclusive DTEND: the day after an all-day event. Date maths in UTC. */
function nextDayBasic(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  return next.toISOString().slice(0, 10).replaceAll("-", "");
}

/** RFC 5545 lines fold at 75 octets; keep it simple with 74 chars. */
function foldLine(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

/**
 * Convert a Europe/London wall-clock date + time to a UTC instant. Works for
 * GMT and BST without a timezone library: guess UTC = wall time, read the
 * guess back in London via Intl, and correct by the difference (one pass is
 * enough because the UK offset is stable across the correction, except in the
 * one repeated clock-change hour where either reading is acceptable).
 */
export function londonToUtc(dateIso: string, timeHHMM: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const seen = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const part = (type: string) => Number(seen.find((p) => p.type === type)?.value ?? 0);
  const seenUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") === 24 ? 0 : part("hour"), part("minute"));
  return new Date(guess.getTime() - (seenUtc - guess.getTime()));
}

/** 20260715T090000Z from a Date. */
function basicUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type IcsEvent = {
  /** Stable unique id, e.g. "su-review-<id>-<date>@becarecompliant.com". */
  uid: string;
  /** ISO date. All-day when no time is given. */
  date: string;
  /** "HH:MM" Europe/London wall time. Makes the event timed. */
  time?: string | null;
  /** Minutes; only used with time. Defaults to 60. */
  durationMinutes?: number | null;
  summary: string;
  description?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendees?: { name: string; email: string }[];
};

/** Build the .ics text for one invite (timed when event.time is set). */
export function buildIcs(event: IcsEvent): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const timing: string[] = [];
  if (event.time) {
    const start = londonToUtc(event.date, event.time);
    const end = new Date(start.getTime() + (event.durationMinutes ?? 60) * 60_000);
    timing.push(`DTSTART:${basicUtcStamp(start)}`, `DTEND:${basicUtcStamp(end)}`);
  } else {
    timing.push(
      `DTSTART;VALUE=DATE:${basicDate(event.date)}`,
      `DTEND;VALUE=DATE:${nextDayBasic(event.date)}`,
    );
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Be Care Compliant//Compliance Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    ...timing,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.organizerEmail) {
    lines.push(
      `ORGANIZER;CN=${escapeText(event.organizerName ?? "Be Care Compliant")}:mailto:${event.organizerEmail}`,
    );
  }
  for (const attendee of event.attendees ?? []) {
    lines.push(
      `ATTENDEE;CN=${escapeText(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`,
    );
  }
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Base64 for the Resend attachment content field. */
export function icsToBase64(ics: string): string {
  return Buffer.from(ics, "utf8").toString("base64");
}

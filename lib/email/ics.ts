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

export type IcsEvent = {
  /** Stable unique id, e.g. "su-review-<id>-<date>@becarecompliant.com". */
  uid: string;
  /** ISO date (all-day event). */
  date: string;
  summary: string;
  description?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendees?: { name: string; email: string }[];
};

/** Build the .ics text for one all-day invite. */
export function buildIcs(event: IcsEvent): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Be Care Compliant//Compliance Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${basicDate(event.date)}`,
    `DTEND;VALUE=DATE:${nextDayBasic(event.date)}`,
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

/**
 * Which calendar app just fetched the feed.
 *
 * WHY THIS EXISTS (Phil, 2026-09-15). He subscribed in Outlook, I booked a supervision five
 * minutes later, and Outlook showed nothing. Nothing was broken: Outlook had fetched once at
 * subscribe time, found an empty calendar, and would not look again for about three hours. The
 * only way to KNOW that was to read the Vercel logs, which is not something he or any office
 * member can do. The page said "last checked" but not BY WHAT, so the one fact that answers the
 * question was the one fact missing.
 *
 * THE LABEL SET IS DELIBERATELY SMALL AND CLOSED. Every fetch writes a row keyed on the label,
 * so an open-ended set would let anyone holding the link grow unbounded rows by varying their
 * User-Agent. Five labels means at most five rows per person, whatever arrives.
 *
 * AND IT IS A GUESS, NOT A FACT. A User-Agent is a claim the client makes. Nothing is decided by
 * this: it is a line of text on a diagnostics panel. The RAW agent is stored alongside, because
 * the honest answer to an unrecognised fetcher is to show what it actually said rather than to
 * file it under a label somebody invented.
 */

export type CalendarClient = "Outlook" | "Apple Calendar" | "Google Calendar" | "Browser" | "Other";

export const CALENDAR_CLIENTS: readonly CalendarClient[] = [
  "Outlook",
  "Apple Calendar",
  "Google Calendar",
  "Browser",
  "Other",
];

/**
 * Apple's fetchers identify themselves clearly: iOS sends dataaccessd, macOS sends CalendarAgent.
 * Google's importer is named outright. Microsoft's is the one we are least sure of, which is
 * exactly why the raw agent is kept: the first real Outlook fetch will tell us what it says, and
 * this list can then be corrected from evidence rather than from guesswork.
 */
export function calendarClientFrom(userAgent: string | null | undefined): CalendarClient {
  if (!userAgent) return "Other";
  const ua = userAgent.toLowerCase();

  if (ua.includes("dataaccessd") || ua.includes("calendaragent") || ua.includes("icalendar")) {
    return "Apple Calendar";
  }
  if (ua.includes("google-calendar") || ua.includes("googlecalendar")) return "Google Calendar";
  if (
    ua.includes("outlook") ||
    ua.includes("msoffice") ||
    ua.includes("ms-office") ||
    ua.includes("microsoft")
  ) {
    return "Outlook";
  }
  /* A person opening the link in a browser to see what it does. Worth telling apart from a real
     calendar app, or a curious click looks like the subscription working. */
  if (ua.includes("mozilla") || ua.includes("safari") || ua.includes("chrome")) return "Browser";
  return "Other";
}

/** Raw agents are stored for diagnosis; keep them short and free of line breaks. */
export function tidyAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const clean = userAgent.replace(/[\r\n\t]+/g, " ").trim();
  if (clean === "") return null;
  return clean.length > 300 ? `${clean.slice(0, 297)}...` : clean;
}

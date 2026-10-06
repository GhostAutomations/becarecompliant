/**
 * What a company calls its absence meetings (0408, Phil 2026-10-06). Thistle Care hold
 * "disciplinary hearings"; everybody else keeps "absence management meeting". Pure, tested.
 */

export const DEFAULT_MEETING_NAME = "absence management meeting";
export const MEETING_NAME_MAX = 60;

/** Settings input to what is stored: trimmed, single spaced, null when blank (the default). */
export function cleanMeetingName(raw: unknown): { name: string | null } | { error: string } {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return { name: null };
  if (s.length > MEETING_NAME_MAX) return { error: `Keep the meeting name to ${MEETING_NAME_MAX} characters.` };
  if (/[–—]|\s-\s/.test(s)) return { error: "Leave dashes out of the meeting name." };
  if (s.toLowerCase() === DEFAULT_MEETING_NAME) return { name: null };
  return { name: s };
}

/** The name as it reads inside a sentence: "a Stage 2 disciplinary hearing". */
export function meetingNameInSentence(stored: string | null | undefined): string {
  const s = (stored ?? "").trim();
  if (!s) return DEFAULT_MEETING_NAME;
  // Lower the first letter only, and not at all when the first word is an acronym
  // ("HR review" stays as it is).
  const first = s.split(" ")[0];
  if (first.length > 1 && first === first.toUpperCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The name as a heading: "Disciplinary Hearing", "Absence Management Meeting". */
export function meetingNameAsTitle(stored: string | null | undefined): string {
  return meetingNameInSentence(stored)
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

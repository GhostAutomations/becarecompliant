/**
 * Return to Work questions the employee answers themselves (Phil, 2026-09-25).
 *
 * "when that is drafted it stays for that specific return to work, so it stops using ai
 * credits, then it sends a text with a link to those questions in the employee portal, then
 * they must complete those questions. it then comes back to the return to work and the return
 * to work tile is updated."
 *
 * PURE AND IMPORTLESS, so node's test runner can load it straight from the .ts file and the
 * browser can share it with the server: the phone rule, the words of the text, the pill on the
 * tile and the note written into the Evidence are all decided here, once.
 */

/** How long the link in the text keeps working. Sending it again starts a fresh week. */
export const RTW_LINK_DAYS = 7;

/** Where the link lands: inside the employee's own portal, so they must be signed in. */
export function rtwPortalPath(questionnaireId: string): string {
  return `/my/return-to-work/${questionnaireId}`;
}

/**
 * A UK mobile number as +447..., or null when it is not one.
 *
 * Our Twilio number can only text UK mobiles, so anything else is refused here with a reason
 * the manager can act on rather than failing at Twilio. People type numbers every way there is:
 * 07700 900123, +44 7700 900123, 447700900123, 0044 7700 900123.
 */
export function ukMobileToE164(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("0044")) digits = digits.slice(4);
  else if (digits.startsWith("44")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  // What is left is the national number without its 0: a UK mobile is 7 and nine more digits.
  if (!/^7\d{9}$/.test(digits)) return null;
  return `+44${digits}`;
}

/** The last four digits, which is all a screen needs to show which phone it went to. */
export function lastFour(e164: string): string {
  return e164.replace(/\D/g, "").slice(-4);
}

/**
 * The text itself. No dashes (customer facing copy). The company's name leads, because a carer
 * is being asked something by their employer, not by us.
 */
export function rtwSmsBody(opts: { firstName: string; companyName: string; link: string }): string {
  const first = opts.firstName.trim() || "there";
  return `Hi ${first}, ${opts.companyName} would like you to answer a few questions before your Return to Work meeting. Please sign in to answer them: ${opts.link}`;
}

export type RtwQuestionnaireStatus = "drafted" | "sent" | "answered" | "recorded";

/** Whether a sent link has run out. A link with no expiry never does. */
export function rtwLinkExpired(expiresAtIso: string | null, nowMs: number): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  return Number.isFinite(t) && t < nowMs;
}

/**
 * The pill shown beside a Return to Work on the dashboard tile and the Absence page, or null
 * when there is nothing to say (no questions, or only a draft nobody has sent).
 */
export function rtwQuestionsPill(
  q: { status: RtwQuestionnaireStatus; expiresAt: string | null } | null | undefined,
  nowMs: number,
): { label: string; className: string } | null {
  if (!q) return null;
  if (q.status === "answered") return { label: "Answers in", className: "pill-green" };
  if (q.status === "sent") {
    return rtwLinkExpired(q.expiresAt, nowMs)
      ? { label: "Link expired", className: "pill-red" }
      : { label: "Questions sent", className: "pill-amber" };
  }
  return null;
}

/** Which answers (numbered from 1) the manager changed from what the employee sent. */
export function changedAnswerNumbers(employee: string[], final: string[]): number[] {
  const out: number[] = [];
  const n = Math.max(employee.length, final.length);
  for (let i = 0; i < n; i += 1) {
    if ((employee[i] ?? "").trim() !== (final[i] ?? "").trim()) out.push(i + 1);
  }
  return out;
}

/** dd/mm/yyyy in Europe/London. */
function ukDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(t));
}

function listNumbers(nums: number[]): string {
  if (nums.length === 1) return `question ${nums[0]}`;
  const head = nums.slice(0, -1).join(", ");
  return `questions ${head} and ${nums[nums.length - 1]}`;
}

/**
 * The line written at the top of the answers in the Evidence, so anyone reading it later can
 * tell what the employee said from what the manager changed after ringing them.
 */
export function rtwProvenanceNote(opts: {
  firstName: string;
  answeredAtIso: string;
  changed: number[];
  changedByName: string | null;
}): string {
  const who = opts.firstName.trim() || "The employee";
  const when = ukDate(opts.answeredAtIso);
  let note = `Answered by ${who} through their portal${when ? ` on ${when}` : ""}.`;
  if (opts.changed.length > 0) {
    note += ` The answer to ${listNumbers(opts.changed)} was changed by ${opts.changedByName || "the interviewer"} after speaking to them.`;
    if (opts.changed.length > 1) note = note.replace("The answer to", "The answers to").replace(" was changed", " were changed");
  }
  return note;
}

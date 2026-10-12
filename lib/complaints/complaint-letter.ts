/**
 * Be Care Compliant: complaint responses as letters (Phil, 2026-10-12, THE LIST 54,
 * docs/decisions/complaint-letters.md).
 *
 * The Initial Response and the Complaint Response are laid out like the absence letters: the
 * company's letterhead, the date, Private and confidential, the complainant's name and address,
 * Dear, an RE line with the complaint reference, the words, and the sign off of whoever sends it
 * (their signature, name and job title). This module decides the words around the AI's text and
 * tidies that text; the PDF is drawn by the absence outcome letter's layout, so the two match.
 *
 * Pure and importless apart from the other pure letter modules, so node --test can load it.
 */

import { addressLines, cleanLetterBody, letterDate, type OutcomeLetterDoc } from "../absence/invitation-letter.ts";
import { cleanOutcomeBody } from "../absence/outcome-letter.ts";
import { letterPlainText } from "../letters/rich-text.ts";

export type ComplaintLetterKind = "initial" | "response";

/** The RE line: the complaint's reference, so a reply can be matched to it. */
export function complaintReLine(kind: ComplaintLetterKind, ref: string): string {
  return kind === "initial" ? `RE: Your complaint, reference ${ref}` : `RE: Our response to your complaint, reference ${ref}`;
}

/** The email's subject when the letter is emailed. */
export function complaintEmailSubject(kind: ComplaintLetterKind, ref: string): string {
  return kind === "initial" ? `Your complaint, reference ${ref}` : `Our response to your complaint, reference ${ref}`;
}

const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof|professor|rev|revd|sir|dame|lady|lord)\.?$/i;

/**
 * "Dear" for a formal letter (Phil, 2026-10-12): the title and surname when the name starts with a
 * title ("Mrs Jo Example" is "Dear Mrs Example"), otherwise the name as recorded, and "Dear Sir or
 * Madam" when no name was given.
 */
export function complaintSalutation(name: string | null | undefined): string {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "Dear Sir or Madam";
  const parts = n.split(" ");
  if (parts.length >= 2 && TITLES.test(parts[0])) return `Dear ${parts[0]} ${parts[parts.length - 1]}`;
  return `Dear ${n}`;
}

/** What the AI must and must not write, for both letters. */
export const COMPLAINT_LETTER_RULES = [
  "Write ONLY the words of the letter between the greeting and the sign off: no greeting (no \"Dear\"),",
  "no sign off (no \"Yours sincerely\" or name), no addresses, no date, no subject or reference line and no",
  "headings. The company's letter adds all of those around your words.",
  "Plain text, short paragraphs with a blank line between them. Plain, warm, professional British English,",
  "written by the company as \"we\" to the complainant as \"you\". No dashes. No markdown, no bullet points.",
  "Write every date in full with its ordinal, for example 1st October 2026. Use only the details given:",
  "never invent a fact, a finding, a date or a promise.",
].join(" ");

/**
 * The AI's text as the words of the letter: markdown, dashes and stray formatting gone, dates and
 * small numbers written like the rest of the letter, and any greeting or sign off it wrote anyway
 * taken out (the letter prints its own). Letter HTML, or "" when nothing usable came back.
 */
export function cleanComplaintLetterBody(raw: string, complainantName: string | null | undefined): string {
  const text = cleanOutcomeBody(raw)
    .split(/\n{2,}/)
    // A greeting of its own ("Dear Mrs Smith,") at the top, whatever name it used.
    .filter((p, i) => !(i === 0 && /^dear\b/i.test(p.trim()) && p.trim().length <= 80))
    .join("\n\n");
  return cleanLetterBody(text, String(complainantName ?? "").trim() || "the complainant");
}

/** The letter as the PDF lays it out (the absence outcome letter's layout). */
export function buildComplaintLetterDoc(i: {
  kind: ComplaintLetterKind;
  ref: string;
  companyName: string;
  letterheadAddress: string | null;
  letterheadPhone: string | null;
  letterDateIso: string;
  recipientName: string | null;
  recipientAddress: string | null;
  /** The words, as letter HTML. */
  bodyHtml: string;
  /** Whoever sends it, with their job title (Phil, 2026-10-12). */
  signer: { name: string; role: string | null };
}): OutcomeLetterDoc {
  const letterheadLines = addressLines(i.letterheadAddress);
  const phoneLines = String(i.letterheadPhone ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => `Tel: ${p}`);
  const name = String(i.recipientName ?? "").trim();
  const recipientLines = [name, ...addressLines(i.recipientAddress)].filter(Boolean);
  const date = letterDate(i.letterDateIso);
  const salutation = complaintSalutation(name);
  const reLine = complaintReLine(i.kind, i.ref);
  const signOff = { closing: "Yours sincerely", name: i.signer.name, role: i.signer.role };
  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    ["Private and confidential", ...recipientLines].join("\n"),
    salutation,
    reLine,
    letterPlainText(i.bodyHtml),
    [signOff.closing, signOff.name, signOff.role ?? ""].filter(Boolean).join("\n"),
  ].join("\n\n");
  return {
    companyName: i.companyName,
    letterheadLines,
    phoneLines,
    date,
    recipientLines,
    salutation,
    reLine,
    body: i.bodyHtml,
    signOff,
    plainText,
  };
}

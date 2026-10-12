/**
 * Be Care Compliant — the employee's absence meeting invitation as a LETTER (Phil, 2026-10-06).
 *
 * Thistle Care sent their own: their letterhead, the date, the employee's name and address,
 * "Dear Jo", a RE line, when and where the hearing is, every absence it is about with its date,
 * reason and length, what it could lead to, the right to be accompanied, and the manager's name and
 * role. That letter is now what goes as the PDF attached to the invitation email, and what is kept
 * in the person's Evidence history.
 *
 * This file decides WHAT the letter says, as plain data, so it is tested on its own; the PDF
 * (invitation-letter-pdf.tsx) only lays it out. The middle of the letter is the company's own
 * wording (Settings, Letters), merged exactly as the email always merged it.
 *
 * Pure: its only import is the letter text rules (lib/letters/rich-text.ts), itself pure. No dashes
 * in anything a customer reads.
 *
 * THE LETTER'S WORDS ARE LETTER HTML (Phil, 2026-10-12, Job 2 Part B): bold, italic, underline,
 * sizes, lists and headings, made in the editor. Old plain text wording and letters are read by the
 * rules they always had (rich-text.ts), so nothing written before needs changing.
 */

import {
  blockText,
  blocksToLetterHtml,
  escapeHtml,
  letterBlocksOf,
  letterPlainText,
  toLetterHtml,
  type RichBlock,
} from "../letters/rich-text.ts";

export type InvitationAbsence = {
  start_date: string;
  end_date: string | null;
  days: number | string | null;
  reason: string | null;
};

export type InvitationLetterInput = {
  companyName: string;
  /** Office address as typed in Settings, Branches: commas or new lines between parts. */
  letterheadAddress: string | null;
  /** One number, or two with a comma between. */
  letterheadPhone: string | null;
  letterDateIso: string;
  recipientName: string;
  recipientAddress: string | null;
  stage: number;
  /** "Stage 2 disciplinary hearing": the stage label as the wording uses it. */
  stageLabel: string;
  /** "Disciplinary Hearing": the meeting name as a heading. */
  meetingTitle: string;
  meetingDateIso: string;
  meetingTime: string;
  durationMinutes: number;
  /** The full address, or "Microsoft Teams". */
  location: string;
  teams: boolean;
  conductorName: string;
  conductorRole: string | null;
  /** The company's invitation wording, merged, blank paragraphs already dropped: each one a
   *  paragraph of plain text or a block of letter HTML. */
  wordingParagraphs: string[];
  /** The rearranged note, merged, when the meeting has moved. */
  rearrangedNote: string | null;
  /** The absences that count, oldest first. */
  absences: InvitationAbsence[];
  /** "6 months": the rolling window in words. */
  windowWords: string;
  /** The whole letter between the RE line and Yours sincerely, as edited in Book meeting (Phil,
   *  2026-10-08: "match in full"). When given, the letter prints exactly this. */
  bodyOverride?: string | null;
  /** Whoever signs the letter (Phil, 2026-10-12): their name and job title go under the signature.
   *  None, and the person holding the meeting stays in the sign off. */
  signer?: { name: string; role: string | null } | null;
};

export type InvitationLetter = {
  companyName: string;
  letterheadLines: string[];
  phoneLines: string[];
  date: string;
  recipientLines: string[];
  salutation: string;
  reLine: string;
  /** Before the meeting details: the rearranged note and the first block of the wording, as letter HTML. */
  opening: string[];
  details: Array<{ label: string; value: string }>;
  absenceIntro: string;
  absenceLines: string[];
  /** The rest of the wording, as letter HTML blocks. */
  closing: string[];
  /** The letter between the RE line and Yours sincerely as letter HTML: what the PDF prints, and what
   *  the Book meeting editor shows. The edited letter when there is one, else standardBody. */
  body: string;
  /** The same, built from the company's wording and the meeting: what "standard wording" means. */
  standardBody: string;
  signOff: { closing: string; name: string; role: string | null };
  /** The whole letter as plain text, for the record. */
  plainText: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** "6th October 2026". */
export function letterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${ordinal(Number(m[3]))} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "Tuesday 20th October 2026". */
export function letterDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const dow = DAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${dow} ${letterDate(iso)}`;
}

/** Split an address into the lines a letter prints. An office address is typed on one line with
 *  commas; a home address is typed as envelope lines, so when it has line breaks those are kept
 *  and its commas stay inside the line ("Flat 2, 10 Example Street"). */
export function addressLines(raw: string | null | undefined): string[] {
  const s = String(raw ?? "");
  return s
    .split(/\r?\n/.test(s) ? /\r?\n/ : /,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dayCount(a: InvitationAbsence): number {
  const n = Number(a.days);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function daysWords(n: number): string {
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  return `${shown} ${n === 1 ? "day" : "days"}`;
}

/** "11th April 2026: Sickness, 1 day" (or a span when it ran over several days). */
export function absenceLine(a: InvitationAbsence): string {
  const when =
    a.end_date && a.end_date !== a.start_date
      ? `${letterDate(a.start_date)} to ${letterDate(a.end_date)}`
      : letterDate(a.start_date);
  const reason = (a.reason ?? "").replace(/\s+/g, " ").trim() || "No reason recorded";
  return `${when}: ${reason}, ${daysWords(dayCount(a))}`;
}

/** THE SIGN OFF FOLLOWS THE SIGNER (Phil, 2026-10-12, docs/decisions/letter-signatures.md): whoever
 *  signs has their own name and job title under their signature; unsigned, the person holding the
 *  meeting stays, as before. */
export function letterSignOff(
  holderName: string,
  holderRole: string | null,
  signer?: { name: string; role: string | null } | null,
): { closing: string; name: string; role: string | null } {
  const who = signer && signer.name.trim() ? signer : { name: holderName, role: holderRole };
  return { closing: "Yours sincerely", name: who.name, role: who.role };
}

export function buildInvitationLetter(i: InvitationLetterInput): InvitationLetter {
  const firstName = i.recipientName.trim().split(/\s+/)[0] || i.recipientName.trim();
  const wording = i.wordingParagraphs.map((p) => toLetterHtml(p)).filter(Boolean);
  const [first, ...rest] = wording;
  const opening = [
    i.rearrangedNote && i.rearrangedNote.trim() ? `<p>${escapeHtml(i.rearrangedNote.trim())}</p>` : null,
    first,
  ].filter((p): p is string => Boolean(p));

  const details = [
    { label: "Date", value: letterDay(i.meetingDateIso) },
    { label: "Time", value: i.meetingTime },
    { label: "Length", value: `${i.durationMinutes} minutes` },
    { label: "Where", value: i.teams ? "Microsoft Teams. A Teams invite will follow." : addressLines(i.location).join(", ") },
    { label: "Held by", value: i.conductorRole ? `${i.conductorName}, ${i.conductorRole}` : i.conductorName },
  ];

  const total = i.absences.reduce((sum, a) => sum + dayCount(a), 0);
  const n = i.absences.length;
  const absenceIntro =
    n === 0
      ? `The ${i.stageLabel} is about your absence record over the last ${i.windowWords}.`
      : `The ${i.stageLabel} is about the following ${n === 1 ? "absence" : `${n} absences`}, ${daysWords(total)} in all, recorded in the last ${i.windowWords}:`;
  const absenceLines = i.absences.map(absenceLine);

  const signOff = letterSignOff(i.conductorName, i.conductorRole, i.signer);
  const letterheadLines = addressLines(i.letterheadAddress);
  const phoneLines = String(i.letterheadPhone ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => `Tel: ${p}`);
  const recipientLines = [i.recipientName.trim(), ...addressLines(i.recipientAddress)];
  const reLine = `RE: Stage ${i.stage} ${i.meetingTitle} Invitation`;
  const date = letterDate(i.letterDateIso);
  const salutation = `Dear ${firstName}`;

  const standardBody = invitationBodyHtml({ opening, details, absenceIntro, absenceLines, closing: rest });
  const body = cleanLetterBody(i.bodyOverride, i.recipientName) || standardBody;

  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    recipientLines.join("\n"),
    salutation,
    reLine,
    letterPlainText(body),
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
    opening,
    details,
    absenceIntro,
    absenceLines,
    closing: rest,
    body,
    standardBody,
    signOff,
    plainText,
  };
}

/* ---------------------------------------------------------------------------------------------
 * THE LETTER AS ONE BOX OF TEXT (Phil, 2026-10-08): the Book meeting box holds the whole letter
 * between the RE line and Yours sincerely, and the PDF is drawn from that text, so the two always
 * match. A blank line starts a new paragraph and each extra blank line adds space. Lines starting
 * with a bullet print as a list, and a paragraph made only of "Label: value" lines (Date, Time,
 * Where...) prints as the meeting details table.
 * ------------------------------------------------------------------------------------------- */

/** The standard letter between the RE line and Yours sincerely, as letter HTML: the wording's
 *  first block, the meeting details (drawn as the details table), the absences as a list, then
 *  the rest of the wording. */
export function invitationBodyHtml(p: {
  opening: string[];
  details: Array<{ label: string; value: string }>;
  absenceIntro: string;
  absenceLines: string[];
  closing: string[];
}): string {
  const details = `<p>${p.details.map((d) => escapeHtml(`${d.label}: ${d.value}`)).join("<br>")}</p>`;
  const absences =
    `<p>${escapeHtml(p.absenceIntro)}</p>` +
    (p.absenceLines.length ? `<ul>${p.absenceLines.map((l) => `<li><p>${escapeHtml(l)}</p></li>`).join("")}</ul>` : "");
  return [...p.opening, details, absences, ...p.closing].join("");
}

const isGreeting = (text: string, name: string, first: string) => {
  const t = text.trim().toLowerCase();
  const who = t.replace(/^dear\s+/, "").replace(/[,.:]$/, "").trim();
  return t.length <= 80 && (who === name || who === first);
};

/**
 * The letter's blocks without a greeting or sign off of their own: the letter prints "Dear Jo" and
 * the sign off itself, so neither appears twice. A sign off ends the letter there, the blocks after
 * it go with it. Spaces at either end go too.
 */
export function letterBodyBlocks(blocks: RichBlock[], recipientName: string): RichBlock[] {
  const name = recipientName.trim().toLowerCase();
  const first = name.split(/\s+/)[0] ?? "";
  const out: RichBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "para" || b.kind === "heading") {
      const cut = b.lines.findIndex((l) => SIGN_OFF.test(l.map((r) => r.text).join("").trim()));
      if (cut === 0) break;
      if (cut > 0) {
        out.push({ ...b, lines: b.lines.slice(0, cut) });
        break;
      }
      if (!out.some((o) => o.kind !== "space") && isGreeting(blockText(b), name, first)) continue;
    }
    out.push(b);
  }
  while (out.length && out[0].kind === "space") out.shift();
  while (out.length && out[out.length - 1].kind === "space") out.pop();
  return out;
}

/** An edited letter, tidied: no Dear line or sign off of its own (the letter prints both), capped,
 *  as letter HTML. Empty when nothing usable was typed, so the standard letter is used. */
export function cleanLetterBody(raw: string | null | undefined, recipientName: string): string {
  if (!raw) return "";
  const kept = letterBodyBlocks(letterBlocksOf(String(raw).slice(0, 40_000)), recipientName);
  return kept.some((b) => b.kind !== "space") ? blocksToLetterHtml(kept) : "";
}

/* ---------------------------------------------------------------------------------------------
 * THE OUTCOME LETTER AS A LETTER (Phil, 2026-10-07: "the same kind of format as the Thistle Care
 * letter"): laid out exactly like the invitation letter above, and kept in this file so both share
 * the same date and address rules. Letterhead, date,
 * the employee's name and home address, "Dear Jo", a RE line, the company's wording with the
 * outcome in the middle, then Yours sincerely, the manager's name and their role.
 * ------------------------------------------------------------------------------------------- */


/** The days an employee can be given to appeal (Phil, 2026-10-07). Seven unless chosen. */
export const APPEAL_DAY_CHOICES = ["5", "7", "10", "14"] as const;
export const DEFAULT_APPEAL_DAYS = "7";

/** "7", or the default when nothing usable was chosen. */
export function appealDays(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  return /^\d{1,2}$/.test(v) && Number(v) > 0 ? v : DEFAULT_APPEAL_DAYS;
}

export type OutcomeLetterInput = {
  companyName: string;
  letterheadAddress: string | null;
  letterheadPhone: string | null;
  letterDateIso: string;
  recipientName: string;
  recipientAddress: string | null;
  stage: number | null;
  /** "Disciplinary Hearing": the meeting name as a heading. */
  meetingTitle: string;
  conductorName: string;
  conductorRole: string | null;
  /** The company's outcome wording, merged, split into paragraphs (plain text). */
  wordingParagraphs?: string[];
  /** Or the whole letter between Dear and Yours sincerely as letter HTML, as approved. */
  bodyHtml?: string;
  /** Whoever signs the letter: their name and job title go under the signature (letterSignOff). */
  signer?: { name: string; role: string | null } | null;
};

export type OutcomeLetterDoc = {
  companyName: string;
  letterheadLines: string[];
  phoneLines: string[];
  date: string;
  recipientLines: string[];
  salutation: string;
  reLine: string;
  /** The letter between Dear and Yours sincerely, as letter HTML. */
  body: string;
  signOff: { closing: string; name: string; role: string | null };
  plainText: string;
};

const SIGN_OFF = /^(yours sincerely|yours faithfully|kind regards|best wishes|regards)\b/i;

/**
 * The wording without its own greeting or sign off: the letter prints "Dear Jo" and the sign off
 * itself, so a company whose wording still starts "Jo Bloggs," or ends "Yours sincerely" does not
 * get them twice.
 */
export function letterBodyParagraphs(paragraphs: string[], recipientName: string): string[] {
  const name = recipientName.trim().toLowerCase();
  const first = name.split(/\s+/)[0] ?? "";
  const kept = paragraphs.filter((p) => {
    const t = p.trim();
    if (!t) return true; // a space the manager added
    if (SIGN_OFF.test(t)) return false;
    const greet = t.toLowerCase().replace(/^dear\s+/, "").replace(/[,.:]$/, "").trim();
    if (t.length <= 80 && (greet === name || greet === first)) return false;
    return true;
  });
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept;
}

export function buildOutcomeLetterDoc(i: OutcomeLetterInput): OutcomeLetterDoc {
  const firstName = i.recipientName.trim().split(/\s+/)[0] || i.recipientName.trim();
  const letterheadLines = addressLines(i.letterheadAddress);
  const phoneLines = String(i.letterheadPhone ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => `Tel: ${p}`);
  const recipientLines = [i.recipientName.trim(), ...addressLines(i.recipientAddress)];
  const reLine = `RE: ${i.stage ? `Stage ${i.stage} ` : ""}${i.meetingTitle} Outcome`;
  const date = letterDate(i.letterDateIso);
  const salutation = `Dear ${firstName}`;
  const raw =
    i.bodyHtml ??
    (i.wordingParagraphs ?? []).map((p) => (p.trim() ? toLetterHtml(p) : "<p></p>")).join("");
  const body = blocksToLetterHtml(letterBodyBlocks(letterBlocksOf(raw), i.recipientName));
  const signOff = letterSignOff(i.conductorName, i.conductorRole, i.signer);
  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    recipientLines.join("\n"),
    salutation,
    reLine,
    letterPlainText(body),
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
    body,
    signOff,
    plainText,
  };
}

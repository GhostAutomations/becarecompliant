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
 * Pure and self-contained (no runtime imports). No dashes in anything a customer reads.
 */

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
  /** The company's invitation wording, merged, blank paragraphs already dropped. */
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
};

export type InvitationLetter = {
  companyName: string;
  letterheadLines: string[];
  phoneLines: string[];
  date: string;
  recipientLines: string[];
  salutation: string;
  reLine: string;
  /** Before the meeting details: the rearranged note and the first paragraph of the wording. */
  opening: string[];
  details: Array<{ label: string; value: string }>;
  absenceIntro: string;
  absenceLines: string[];
  /** The rest of the wording. */
  closing: string[];
  /** The letter between the RE line and Yours sincerely as text: what the PDF prints, and what the
   *  Book meeting box shows. The edited text when there is one, else standardBody. */
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

export function buildInvitationLetter(i: InvitationLetterInput): InvitationLetter {
  const firstName = i.recipientName.trim().split(/\s+/)[0] || i.recipientName.trim();
  const [first, ...rest] = i.wordingParagraphs;
  const opening = [i.rearrangedNote, first].filter((p): p is string => Boolean(p && p.trim()));

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

  const signOff = { closing: "Yours sincerely", name: i.conductorName, role: i.conductorRole };
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

  const standardBody = invitationBodyText({ opening, details, absenceIntro, absenceLines, closing: rest });
  const body = cleanLetterBody(i.bodyOverride, i.recipientName) || standardBody;

  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    recipientLines.join("\n"),
    salutation,
    reLine,
    body,
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

export const BULLET = "\u2022";

/** The standard letter between the RE line and Yours sincerely, as text. */
export function invitationBodyText(p: {
  opening: string[];
  details: Array<{ label: string; value: string }>;
  absenceIntro: string;
  absenceLines: string[];
  closing: string[];
}): string {
  return [
    ...p.opening,
    p.details.map((d) => `${d.label}: ${d.value}`).join("\n"),
    [p.absenceIntro, ...p.absenceLines.map((l) => `${BULLET} ${l}`)].join("\n"),
    ...p.closing,
  ]
    .filter((x) => x.trim())
    .join("\n\n");
}

/** An edited letter, tidied: no Dear line or sign off of its own (the letter prints both), capped.
 *  Empty when nothing usable was typed, so the standard letter is used. */
export function cleanLetterBody(raw: string | null | undefined, recipientName: string): string {
  if (!raw) return "";
  const lines = String(raw).replace(/\r\n?/g, "\n").slice(0, 12_000).split("\n");
  const name = recipientName.trim().toLowerCase();
  const first = name.split(/\s+/)[0] ?? "";
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length) {
    const greet = lines[0].trim().toLowerCase();
    const who = greet.replace(/^dear\s+/, "").replace(/[,.:]$/, "").trim();
    if (greet.startsWith("dear ") && (who === name || who === first)) lines.shift();
  }
  const end = lines.findIndex((l) => SIGN_OFF.test(l.trim()));
  const kept = end >= 0 ? lines.slice(0, end) : lines;
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.map((l) => l.replace(/\s+$/, "")).join("\n");
}

export type BodyBlock =
  | { kind: "text"; text: string }
  | { kind: "details"; rows: Array<{ label: string; value: string }> }
  | { kind: "bullets"; lines: string[] }
  | { kind: "space" };

const BULLET_LINE = /^\s*[\u2022*]\s+(.*)$/;
const DETAIL_LINE = /^([A-Za-z][A-Za-z ]{0,13}):\s+(\S.*)$/;

/** The letter text as blocks for the PDF, in order. */
export function bodyBlocks(text: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  let para: string[] = [];
  let broke = false;
  const flush = () => {
    if (!para.length) return;
    const details = para.length >= 2 && para.every((l) => DETAIL_LINE.test(l.trim()));
    if (details) {
      blocks.push({
        kind: "details",
        rows: para.map((l) => {
          const m = l.trim().match(DETAIL_LINE)!;
          return { label: m[1], value: m[2] };
        }),
      });
    } else {
      let run: string[] = [];
      let bullets: string[] = [];
      const endRun = () => {
        if (run.length) blocks.push({ kind: "text", text: run.join("\n") });
        run = [];
      };
      const endBullets = () => {
        if (bullets.length) blocks.push({ kind: "bullets", lines: bullets });
        bullets = [];
      };
      for (const line of para) {
        const m = line.match(BULLET_LINE);
        if (m) {
          endRun();
          bullets.push(m[1]);
        } else {
          endBullets();
          run.push(line);
        }
      }
      endRun();
      endBullets();
    }
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      if (para.length) {
        flush();
        broke = true;
      } else if (broke) {
        blocks.push({ kind: "space" });
      }
    } else {
      para.push(line.replace(/\s+$/, ""));
    }
  }
  flush();
  while (blocks.length && blocks[blocks.length - 1].kind === "space") blocks.pop();
  return blocks;
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
  /** The company's outcome wording, merged, split into paragraphs. */
  wordingParagraphs: string[];
};

export type OutcomeLetterDoc = {
  companyName: string;
  letterheadLines: string[];
  phoneLines: string[];
  date: string;
  recipientLines: string[];
  salutation: string;
  reLine: string;
  paragraphs: string[];
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
  const paragraphs = letterBodyParagraphs(i.wordingParagraphs, i.recipientName);
  const signOff = { closing: "Yours sincerely", name: i.conductorName, role: i.conductorRole };
  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    recipientLines.join("\n"),
    salutation,
    reLine,
    ...paragraphs,
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
    paragraphs,
    signOff,
    plainText,
  };
}

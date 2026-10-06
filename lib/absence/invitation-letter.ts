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

  const plainText = [
    [i.companyName, ...letterheadLines, ...phoneLines].join("\n"),
    date,
    recipientLines.join("\n"),
    salutation,
    reLine,
    ...opening,
    details.map((d) => `${d.label}: ${d.value}`).join("\n"),
    [absenceIntro, ...absenceLines.map((l) => `  ${l}`)].join("\n"),
    ...rest,
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
    signOff,
    plainText,
  };
}

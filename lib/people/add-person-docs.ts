/**
 * Be Care Compliant: DBS and Right to Work on Add a person (Phil, 2026-10-15;
 * docs/decisions/add-person-documents.md). Pure and importless, so node --test runs it.
 *
 * The two sections are the company's own DBS and Right to Work forms (the ones behind Complete on
 * the record's cards), filled in on Add a person and saved through the same code as on the record.
 * This file holds only the rules Add a person adds around them:
 *
 *   DBS:   one or the other. Either the DBS form is filled in, or "No DBS yet, a risk assessment
 *          will be needed" is ticked. Not both, not neither.
 *   RTW:   mandatory (Phil's popup); the form's own required questions decide what is needed.
 *   Email: with "No DBS yet", the person who added them and the line manager are told a DBS
 *          Pending Risk Assessment is needed, once each (Phil's popup).
 *   Token: one form makes at most one person (0485).
 */

/** The tick box, and its words on screen. */
export const NO_DBS_FIELD = "dbs_none";
export const NO_DBS_LABEL = "No DBS yet, a risk assessment will be needed";

export const DBS_FORM_KEY = "dbs_renewal";
export const RTW_FORM_KEY = "right_to_work";

export type Answers = Record<string, unknown>;

export type DbsChoice =
  | { kind: "details"; answers: Answers }
  | { kind: "none" }
  | { kind: "error"; error: string };

function parseAnswers(raw: string | null | undefined): Answers | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Answers) : null;
  } catch {
    return null;
  }
}

/** Anything typed into the form at all (an empty string or empty list is not an answer). */
export function hasAnyAnswer(answers: Answers | null): boolean {
  if (!answers) return false;
  return Object.values(answers).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== "",
  );
}

/** The DBS section as posted: the details, the tick, or what is wrong. */
export function dbsChoice(input: { none: string | null | undefined; answers: string | null | undefined }): DbsChoice {
  const none = String(input.none ?? "") === "1";
  const answers = parseAnswers(input.answers);
  const typed = hasAnyAnswer(answers);
  if (none && typed) {
    return { kind: "error", error: "Either fill in the DBS details or tick \"No DBS yet\", not both." };
  }
  if (none) return { kind: "none" };
  if (!typed) {
    return {
      kind: "error",
      error: "Fill in the DBS details, or tick \"No DBS yet, a risk assessment will be needed\".",
    };
  }
  return { kind: "details", answers: answers! };
}

/** The Right to Work section as posted, or what is wrong. */
export function rtwAnswers(raw: string | null | undefined): { ok: true; answers: Answers } | { ok: false; error: string } {
  const answers = parseAnswers(raw);
  if (!hasAnyAnswer(answers)) return { ok: false, error: "Fill in the Right to Work details." };
  return { ok: true, answers: answers! };
}

export type Recipient = { profileId: string; email: string | null; name: string | null };

/** Who is told a risk assessment is needed: the adder and the line manager, once each, only
 *  those with an email. A line manager with no login is simply not in the list. */
export function riskEmailRecipients(adder: Recipient, manager: Recipient | null): Recipient[] {
  const out: Recipient[] = [];
  for (const r of [adder, manager]) {
    if (!r || !r.email || !r.email.trim()) continue;
    if (out.some((o) => o.profileId === r.profileId || o.email!.toLowerCase() === r.email!.toLowerCase())) continue;
    out.push(r);
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The form's token, or null when it is missing or not a token. */
export function createToken(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  return UUID.test(s) ? s.toLowerCase() : null;
}

/** The record page notice when the risk assessment email did not go (?dbs_email=...). */
export function riskEmailNotice(code: string | null | undefined, personName: string): string | null {
  if (!code) return null;
  const tail =
    "Open DBS, Risk, Pending risk assessment on this record to complete it, and let their line manager know it is needed.";
  if (code === "not_configured") {
    return `${personName} has been added, but the email asking for a DBS Pending Risk Assessment was not sent, because email is not set up for Be Care Compliant yet. ${tail}`;
  }
  if (code === "no_recipient") {
    return `${personName} has been added, but there was nobody with an email address to tell about the DBS Pending Risk Assessment. ${tail}`;
  }
  if (code === "failed") {
    return `${personName} has been added, but the email asking for a DBS Pending Risk Assessment could not be sent. ${tail}`;
  }
  return null;
}

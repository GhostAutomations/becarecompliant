/**
 * Be Care Compliant — the rules every drafted Return to Work set must follow (Phil, 2026-10-13,
 * after a Thistle draft asked a carer with a three day cold for a fit note, whether work caused
 * it, and about her absences in April and June).
 *
 * A Return to Work is about the ONE absence it was raised for. Patterns and earlier absences belong
 * in stage meetings (lib/absence/meeting-questions.ts, untouched by this), never here.
 *
 *   A  Only this absence: the AI is given nothing else, and any question or summary sentence that
 *      mentions another date, month, earlier absences, patterns, stages or triggers is removed.
 *   C  Fit note (GOV.UK: none is needed for 7 days or less, counting non working days such as
 *      weekends and bank holidays). CALENDAR days, first to last inclusive. 7 or fewer: no fit note
 *      question, one self certification question instead. More than 7: a fit note question, with
 *      the existing upload step (followUp "fit_note").
 *   D  Work as a cause: asked only when the reason points to work (stress, anxiety, low mood or
 *      mental health, an injury, back or muscle pain, an accident, or the employee's own words
 *      mention work). Never for colds, flu, sickness bugs, infections and the like.
 *   E  Always asked: fully fit to return, and the last "anything else you would like to raise"
 *      (Yes, then what). The support question stays out (Phil, 2026-10-08, confirmed 2026-10-13).
 *
 * checkRtwDraft is the deterministic check run on the AI's reply BEFORE anything is saved or shown.
 * Pure and importless apart from the follow up rules, so node --test runs it directly.
 */

import { isAdjustmentQuestion, withRequiredFollowUps, type AiFollowUp } from "../ai-follow-ups.ts";

export type DraftQuestion = {
  question: string;
  type: "text" | "yes_no" | "choice";
  options?: string[];
  followUp?: AiFollowUp;
};

export type RtwAbsence = {
  startDate: string;
  /** The last day of absence; the start date when none was given. */
  endDate: string | null;
  reason: string | null;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
/** Short forms, each pointing at its month number (1 to 12). "may" is the full name already. */
const SHORT_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function utc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Calendar days from the first to the last day of absence, inclusive (3 for 10 to 12 October).
 *  Weekends and bank holidays count, as GOV.UK counts them for a fit note. */
export function calendarDays(startIso: string, endIso: string | null | undefined): number {
  const end = endIso && endIso >= startIso ? endIso : startIso;
  return Math.round((utc(end) - utc(startIso)) / 86_400_000) + 1;
}

/** GOV.UK: a fit note is needed only when the absence is more than 7 days. */
export function needsFitNote(days: number): boolean {
  return days > 7;
}

/** "10 October 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${d} ${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

const KNOWN_REASONS = [
  "sickness and diarrhoea", "cold or flu", "headache or migraine", "stomach upset", "injury",
  "back or muscle pain", "stress or mental health", "dental", "medical appointment",
  "childcare or dependant", "bereavement",
];

/** The reason as it reads in a sentence ("cold or flu"), from the recorded reason's own headings,
 *  or null when it is free text we cannot name safely. */
export function reasonInWords(reason: string | null | undefined): string | null {
  const heads = (reason ?? "")
    .split(";")
    .map((p) => p.split("(")[0].trim().toLowerCase())
    .filter((h) => KNOWN_REASONS.includes(h));
  if (heads.length === 0) return null;
  return heads.length === 1 ? heads[0] : `${heads.slice(0, -1).join(", ")} and ${heads[heads.length - 1]}`;
}

/** The one self certification question for an absence of 7 days or fewer. */
export function selfCertQuestion(a: RtwAbsence): string {
  const end = a.endDate && a.endDate > a.startDate ? a.endDate : null;
  const when = end ? `from ${longDate(a.startDate)} to ${longDate(end)}` : `on ${longDate(a.startDate)}`;
  const why = reasonInWords(a.reason);
  return `Can you confirm you were unfit for work${why ? ` due to ${why}` : ""} ${when}?`;
}

const WORK_REASON_RE =
  /\b(stress\w*|anxi\w+|low mood|depress\w*|mental health|injur\w*|back|muscle\w*|accident\w*|sprain\w*|strain\w*|twist\w*|fell|fall|work|workplace|at work|in work)\b/i;

/** Rule D: whether the work cause question belongs in this Return to Work. */
export function workCauseApplies(reason: string | null | undefined): boolean {
  return WORK_REASON_RE.test(reason ?? "");
}

export const FULLY_FIT_QUESTION = "Do you feel fully fit to return to your normal duties?";
export const WORK_CAUSE_QUESTION = "Did anything at work cause this absence or make it worse?";
export const FIT_NOTE_QUESTION = "Do you have a fit note for this absence?";

const FIT_NOTE_RE = /\b(fit note|sick note|doctor'?s note|statement of fitness|medical certificate)\b/i;
const SELF_CERT_RE = /\b(self[\s-]?certif\w*|unfit for work|confirm (that )?you were (unwell|ill|unfit|off sick))\b/i;
const FULLY_FIT_RE = /\b(fit|well enough|ready|recovered)\b.*\b(return|back|duties|work)\b|\bfully (fit|recovered)\b/i;
const WORK_CAUSE_RE =
  /\b(at|in|from|by) work\b.*\b(caus\w*|worse\w*|contribut\w*|led to|trigger\w*|part)\b|\b(caus\w*|worse\w*|contribut\w*|led to)\b.*\b(at|in|from) work\b|\bwork[\s-]related\b|\bworkplace\b/i;
const OTHER_ABSENCE_RE =
  /\b(earlier|previous|previously|other absences?|pattern\w*|occasions?|stages?|trigger\w*|last time|past absences?|absences this year|times? you have been off|how often)\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}[/.]\d{1,2}([/.]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g;

/** The month numbers (1 to 12) this absence covers. */
function ownMonths(a: RtwAbsence): Set<number> {
  const out = new Set<number>();
  const end = a.endDate && a.endDate >= a.startDate ? a.endDate : a.startDate;
  let [y, m] = a.startDate.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.add(m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Month names that are also everyday words. */
const AMBIGUOUS_MONTHS = new Set(["may", "march", "mar"]);

/** The month a word names (1 to 12), or null. */
function monthOf(word: string): number | null {
  const full = MONTHS.indexOf(word);
  if (full >= 0) return full + 1;
  return SHORT_MONTHS[word] ?? null;
}

/** Rule A: true when the text reaches beyond this one absence: words about earlier absences or
 *  patterns, a month the absence did not cover, or a date that is not its own. */
export function mentionsOtherAbsence(text: string, a: RtwAbsence): boolean {
  if (OTHER_ABSENCE_RE.test(text)) return true;
  const own = ownMonths(a);
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z]+/g) ?? []) {
    const m = monthOf(w);
    if (m === null || own.has(m)) continue;
    // "May I ask" and "march" are words before they are months: only a date or "in May" counts.
    if (AMBIGUOUS_MONTHS.has(w) && !new RegExp(`(\\d\\s*(st|nd|rd|th)?\\s+${w}\\b|\\b${w}\\s+\\d|\\b(in|since|during|of|last|this|early|late|mid|until|before|after)\\s+${w}\\b)`).test(lower)) {
      continue;
    }
    return true;
  }
  const allowed = new Set<string>();
  for (const iso of [a.startDate, a.endDate].filter(Boolean) as string[]) {
    const [y, m, d] = iso.split("-");
    for (const form of [`${Number(d)}/${Number(m)}/${y}`, `${d}/${m}/${y}`, `${Number(d)}/${Number(m)}`, `${d}/${m}`, iso]) {
      allowed.add(form);
    }
  }
  for (const hit of text.match(NUMERIC_DATE_RE) ?? []) {
    if (!allowed.has(hit.replace(/\./g, "/"))) return true;
  }
  return false;
}

/** No dashes in question text (customer copy rule): a spaced or long dash becomes a comma. */
function noDashes(text: string): string {
  return text.replace(/\s+[-–—]\s+/g, ", ").replace(/[–—]/g, ", ").replace(/\s+,/g, ",");
}

export type DraftCheck = {
  questions: DraftQuestion[];
  /** What the check took out, as codes only: never the text, which may hold personal data. */
  removed: string[];
  /** What it put in. */
  added: string[];
};

/**
 * THE CHECK (rules A, C, D, E), run on the AI's questions before they are saved or shown. Required
 * questions go at the front so the question limit never cuts them; the anything else question is
 * last (withRequiredFollowUps, which also keeps support and adjustment questions out).
 */
export function checkRtwDraft(input: DraftQuestion[], a: RtwAbsence, limit = 8): DraftCheck {
  const removed: string[] = [];
  const added: string[] = [];
  const days = calendarDays(a.startDate, a.endDate);
  const fitNote = needsFitNote(days);
  const workCause = workCauseApplies(a.reason);

  let qs = input.map((q) => ({ ...q, question: noDashes(q.question) }));

  qs = qs.filter((q) => {
    if (mentionsOtherAbsence(q.question, a) || (q.options ?? []).some((o) => mentionsOtherAbsence(o, a))) {
      removed.push("other_absence");
      return false;
    }
    if (FIT_NOTE_RE.test(q.question) || q.followUp === "fit_note") {
      if (!fitNote) { removed.push("fit_note_under_8_days"); return false; }
      return true;
    }
    if (SELF_CERT_RE.test(q.question)) {
      removed.push(fitNote ? "self_cert_over_7_days" : "self_cert_reworded");
      return false;
    }
    if (WORK_CAUSE_RE.test(q.question) && !workCause) {
      removed.push("work_cause_not_applicable");
      return false;
    }
    return true;
  });

  // Duplicates of the questions this check owns are replaced by the one standard wording.
  const fullyFitAt = qs.findIndex((q) => FULLY_FIT_RE.test(q.question));
  const fullyFit = fullyFitAt >= 0 ? qs.splice(fullyFitAt, 1)[0] : null;
  if (!fullyFit) added.push("fully_fit");
  const front: DraftQuestion[] = [fullyFit ?? { question: FULLY_FIT_QUESTION, type: "yes_no" }];

  if (!fitNote) {
    front.push({ question: selfCertQuestion(a), type: "yes_no" });
    added.push("self_cert");
  } else {
    const fnAt = qs.findIndex((q) => FIT_NOTE_RE.test(q.question) || q.followUp === "fit_note");
    const fn = fnAt >= 0 ? qs.splice(fnAt, 1)[0] : null;
    if (!fn) added.push("fit_note");
    front.push({ question: fn?.question ?? FIT_NOTE_QUESTION, type: "yes_no", followUp: "fit_note" });
  }

  if (workCause) {
    const wcAt = qs.findIndex((q) => WORK_CAUSE_RE.test(q.question));
    const wc = wcAt >= 0 ? qs.splice(wcAt, 1)[0] : null;
    if (!wc) added.push("work_cause");
    front.push(wc ?? { question: WORK_CAUSE_QUESTION, type: "yes_no" });
  }

  const all = [...front, ...qs];
  if (!all.some((q) => q.type === "yes_no" && q.followUp === "raise")) added.push("anything_else");
  const out = withRequiredFollowUps(all, (question, followUp): DraftQuestion => ({ question, type: "yes_no", followUp }), limit);
  // withRequiredFollowUps keeps support and adjustment questions out and trims to the limit.
  for (const q of all) {
    if (!out.includes(q)) removed.push(isAdjustmentQuestion(q) ? "support_or_adjustment" : "over_limit");
  }
  return { questions: out, removed, added };
}

/** The summary under rule A: any sentence that reaches beyond this absence is dropped. */
export function checkRtwSummary(summary: string, a: RtwAbsence): { summary: string; removed: number } {
  const sentences = summary.match(/[^.!?]+[.!?]*/g) ?? [];
  const kept = sentences.filter((s) => !mentionsOtherAbsence(s, a));
  return { summary: kept.join("").trim(), removed: sentences.length - kept.length };
}

/**
 * Everything the AI is given about the absence (rule A, and UK GDPR data minimisation): this one
 * absence's dates, its calendar days and its reason in the employee's words. `reasonForAi` is that
 * reason with the employee's name taken out by the caller; the rules themselves read the reason as
 * recorded (a name like "Back" must not change whether work is asked about). No other absence,
 * stage, Bradford score, count or name.
 */
export function rtwDraftPrompt(a: RtwAbsence, reasonForAi: string | null = a.reason): string {
  const days = calendarDays(a.startDate, a.endDate);
  const end = a.endDate && a.endDate >= a.startDate ? a.endDate : a.startDate;
  return [
    `First day of absence: ${longDate(a.startDate)}`,
    `Last day of absence: ${longDate(end)}`,
    `Calendar days: ${days}`,
    `Reason given, in the employee's words where recorded: ${reasonForAi?.trim() || "not recorded"}`,
    "",
    needsFitNote(days)
      ? "This absence is more than 7 calendar days, so a fit note is needed: ask whether they have one."
      : "This absence is 7 calendar days or fewer, so they can self certify: do NOT ask about a fit note, sick note or doctor's note. A self certification question is added for you.",
    workCauseApplies(a.reason)
      ? "The reason may involve work: ask one question about whether anything at work caused it or made it worse."
      : "The reason does not point to work: do NOT ask whether work caused it or made it worse.",
  ].join("\n");
}

/** The instructions (rules A to F). The guardrails from v1 stand: never diagnose, never speculate
 *  about a medical cause, never suggest an outcome. */
export const RTW_SYSTEM = [
  "You are helping a UK care sector manager prepare for a Return to Work interview.",
  "A Return to Work is about ONE absence: the one described below. You are told nothing else, and",
  "you must never mention or ask about any other absence, any other date or month, patterns, how",
  "often they are off, stages, triggers, totals or counts. Those belong in other meetings.",
  "Your job is to prepare, not to decide. Write in plain British English. No dashes. Never diagnose,",
  "never speculate about a medical cause, and never suggest disciplinary action or an outcome.",
  "Be warm and practical: the employee may be anxious about returning. Keep each question short.",
  "Reply with STRICT JSON and nothing else: no markdown, no code fence, no words before or after it.",
  "The JSON is one object with exactly two keys.",
  '"summary": one or two sentences of fact about THIS absence only: its dates, length and reason.',
  '"questions": an array of 3 to 6 objects, each with "question" (one short question the manager',
  'should ask, written to be read aloud), "type" (exactly one of "text", "yes_no" or "choice") and,',
  'only when the type is "choice", "options" (an array of 2 to 4 short answers to choose from).',
  "Tailor the questions to the reason and what the employee said. For example, for a cold or flu:",
  "their symptoms, whether they have fully recovered, and anything that would stop them working",
  "safely, such as still being infectious around the people they support. A back injury, a stomach",
  "bug and a migraine do not deserve the same questions.",
  "Always ask whether they feel fully fit to return to their normal duties.",
  "Follow the fit note and work instructions given with the absence exactly.",
  'When you ask whether they have a fit note, make it a yes_no question with "followUp": "fit_note".',
  "NEVER ask about adjustments, support, help, changes to their hours, shifts, rota, availability or",
  "working pattern, flexible working, reduced hours or a phased return, in any wording.",
  'The LAST question MUST be the yes_no question "Is there anything else you would like to raise?"',
  'with "followUp": "raise". Ask one thing per question and never the same thing twice.',
].join(" ");

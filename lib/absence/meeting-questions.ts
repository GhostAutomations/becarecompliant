/**
 * Be Care Compliant — questions drafted for a formal absence meeting (Phil, 2026-09-29, Absence
 * round 2 item 2: "add AI that generates questions based on the person's absences and Return to
 * Works").
 *
 * Pure and isomorphic: the prompt, the reply reader and the "which absences does this meeting
 * discuss" rule, so they can be tested without a server. The Server Action that gathers the record
 * and spends the credit is lib/absence/meeting-questions-actions.ts.
 *
 * PRIVACY: the model is sent what the meeting is about and nothing that identifies the employee.
 * No name, no email, no branch: dates, reasons, what was said at their Return to Works and what was
 * agreed at earlier meetings. Free text is clipped so a long note cannot flood the prompt.
 */

import type { AiQuestion } from "../forms.ts";

export type MeetingAbsence = {
  start_date: string;
  end_date: string | null;
  days: number | null;
  reason: string | null;
};

/**
 * The absences a Stage N meeting discusses (Phil, 2026-07-12): Stage 1 covers the occasions up
 * to its trigger; each later stage covers the new ones since the previous stage's trigger.
 * Numbers stay absolute. With no stage, or no thresholds, or a slice that comes out empty, it is
 * all of them. `chronological` must be the COUNTED absences, oldest first.
 */
export function discussedAbsences<T>(
  chronological: T[],
  stage: number | null,
  thresholds: Array<{ stage: number; occasions: number }>,
): Array<{ e: T; n: number }> {
  const all = chronological.map((e, i) => ({ e, n: i + 1 }));
  if (!stage || thresholds.length === 0) return all;
  const occAt = (s: number) => thresholds.find((t) => t.stage === s)?.occasions;
  const hi = occAt(stage);
  const lo = stage > 1 ? occAt(stage - 1) ?? 0 : 0;
  if (!hi) return all;
  const scoped = all.slice(lo, hi);
  return scoped.length > 0 ? scoped : all;
}

export const MEETING_QUESTIONS_SYSTEM = [
  "You are helping a UK care sector manager prepare for a formal absence management meeting held",
  "under the company's attendance procedure. Your job is to prepare the questions, not to decide anything.",
  "Write in plain British English. No dashes. Never diagnose, never speculate about a medical cause,",
  "never suggest an outcome, a warning or dismissal, and never pre judge: the manager decides after",
  "listening. Be fair, calm and supportive. The employee may be anxious.",
  "Reply with STRICT JSON and nothing else: no markdown, no code fence, no words before or after it.",
  'The JSON is one object with exactly one key, "questions": an array of 5 to 8 objects, each with',
  '"question" (one short question written to be read aloud to the employee), "type" (exactly one of',
  '"text", "yes_no" or "choice") and, only when the type is "choice", "options" (2 to 4 short answers).',
  "THE QUESTIONS MUST BE BUILT FROM THIS PERSON'S RECORD, NOT A GENERIC CHECKLIST. Read the reason",
  "given for every absence and ask about what was actually said, naming the absence by its date and",
  "its reason (for example: the flat tyre on 18 July, or the shift handed back on 27 August because pay",
  "arrived late). Group absences that share a reason or a theme into one question. Point out any",
  "pattern you can see in the dates, weekdays or reasons (the same weekday, next to a weekend or a",
  "rest day, the same reason more than once, absences getting closer together) as a neutral question",
  "for them to explain, never as an accusation.",
  "Fit each question to the kind of reason: for an illness, how they are now, whether it is linked to",
  "an earlier absence and whether they saw a GP; for a family or caring emergency, whether it is still",
  "going on and whether something like emergency leave or flexible working would help; for transport,",
  "money or pay problems, whether it is resolved and what would stop it costing a shift again; for a",
  "personal or legal matter, only what affects their availability for work, asked neutrally, never",
  "about the matter itself. Ask about an underlying health condition or an occupational health",
  "referral ONLY when the reasons are health related and recur, or point to a condition, and then",
  "about that condition. Where a reason is missing or vague, ask them to say more about that date.",
  "When an earlier meeting set targets or agreed support, ask how that has gone. Use what they said at",
  "their Return to Work interviews: follow up on it rather than asking it all again.",
  "Finish with one question on what support would help their attendance and one checking they",
  "understand the attendance level expected of them. Ask one thing per question and never ask the",
  "same thing twice in different words.",
].join(" ");

export type MeetingContext = {
  stage: number | null;
  /** Settings, Absence: what this stage can lead to, e.g. "Verbal warning". Never offered as an
   *  outcome: it tells the model how formal the meeting is. */
  stageAction: string | null;
  discussed: Array<{ n: number; a: MeetingAbsence }>;
  otherCounted: Array<{ n: number; a: MeetingAbsence }>;
  /** What was recorded at the Return to Work for an absence, keyed by the absence's number. */
  rtw: Array<{ n: number; notes: string }>;
  earlierMeetings: Array<{ stage: number | null; date: string | null; notes: string }>;
  discountedCount: number;
};

export function clip(text: string | null | undefined, max = 600): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weekday of a civil date (YYYY-MM-DD), so the model can see weekday patterns. */
export function weekdayOf(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}

/**
 * Takes the employee's own name out of free text before it goes to the AI (the reasons are
 * often written as "Zoe said she feels unwell"). Each name part of two letters or more is
 * replaced with "the employee", whole words only, any case, including a possessive.
 */
export function redactName(text: string | null | undefined, fullName: string | null | undefined): string {
  let out = text ?? "";
  const parts = (fullName ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}'-]/gu, ""))
    .filter((p) => p.length >= 2)
    .sort((x, y) => y.length - x.length);
  for (const p of parts) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}])${esc}('s)?(?![\\p{L}])`, "giu"), (_m, poss) =>
      poss ? "the employee's" : "the employee",
    );
  }
  return out;
}

function line(n: number, a: MeetingAbsence): string {
  const range = a.end_date && a.end_date !== a.start_date ? `${a.start_date} to ${a.end_date}` : a.start_date;
  const days = a.days === null ? "days not recorded" : `${a.days} ${Number(a.days) === 1 ? "day" : "days"}`;
  const day = weekdayOf(a.start_date);
  return `- Absence ${n}: ${range}, ${days}, reason given: ${clip(a.reason, 200) || "not recorded"}${day ? ` (started on a ${day})` : ""}`;
}

export function buildMeetingPrompt(ctx: MeetingContext): string {
  const parts: string[] = [];
  parts.push(
    ctx.stage
      ? `This is a Stage ${ctx.stage} absence management meeting.${ctx.stageAction ? ` Under the company's procedure a Stage ${ctx.stage} meeting can lead to up to and including: ${ctx.stageAction}.` : ""}`
      : "This is a formal absence management meeting.",
  );
  parts.push("", "Absences this meeting discusses:");
  parts.push(...(ctx.discussed.length ? ctx.discussed.map((d) => line(d.n, d.a)) : ["- none recorded"]));
  if (ctx.otherCounted.length) {
    parts.push("", "Their other absences in the current review period:");
    parts.push(...ctx.otherCounted.map((d) => line(d.n, d.a)));
  }
  if (ctx.discountedCount > 0) {
    parts.push(
      "",
      `${ctx.discountedCount} other ${ctx.discountedCount === 1 ? "absence was" : "absences were"} discounted by the company and do not count. Do not ask about them.`,
    );
  }
  parts.push("", "What was recorded at their Return to Work interviews:");
  parts.push(...(ctx.rtw.length ? ctx.rtw.map((r) => `- After absence ${r.n}: ${r.notes}`) : ["- none recorded"]));
  if (ctx.earlierMeetings.length) {
    parts.push("", "Earlier absence meetings:");
    parts.push(
      ...ctx.earlierMeetings.map(
        (m) => `- ${m.stage ? `Stage ${m.stage}` : "Meeting"}${m.date ? ` on ${m.date}` : ""}: ${m.notes || "no notes recorded"}`,
      ),
    );
  }
  return parts.join("\n");
}

/** The Return to Work notes worth sending, from the recorded interview's answers. Signatures,
 *  names and who held it are left out. */
export function rtwNotesFromAnswers(answers: Record<string, unknown> | null | undefined): string {
  if (!answers) return "";
  const bits: string[] = [];
  const add = (label: string, key: string, max = 600) => {
    const v = answers[key];
    const t = typeof v === "string" ? clip(v, max) : "";
    if (t) bits.push(`${label}: ${t}`);
  };
  add("summary", "absence_summary", 300);
  add("questions and answers", "tailored_questions", 900);
  add("referral", "referral", 80);
  add("follow up date", "follow_up_date", 20);
  add("employee comments", "employee_comments", 300);
  return bits.join(". ");
}

/** The Return to Work answers the employee gave through their portal, when the interview itself
 *  has not been recorded yet. */
export function rtwNotesFromPortal(questions: AiQuestion[], answers: unknown[] | null | undefined): string {
  if (!answers || answers.length === 0) return "";
  const pairs = questions
    .map((q, i) => {
      const a = typeof answers[i] === "string" ? clip(answers[i] as string, 200) : "";
      return a ? `${clip(q.question, 150)} ${a}` : "";
    })
    .filter(Boolean);
  return pairs.length ? `their own answers before the interview: ${pairs.join(" | ")}` : "";
}

/** The notes worth sending from an earlier meeting's Evidence. */
export function meetingNotesFromAnswers(answers: Record<string, unknown> | null | undefined): string {
  if (!answers) return "";
  const bits: string[] = [];
  const add = (label: string, key: string, max = 400) => {
    const v = answers[key];
    const t = typeof v === "string" ? clip(v, max) : "";
    if (t) bits.push(`${label}: ${t}`);
  };
  add("their explanation", "employees_explanation");
  add("support or adjustments discussed", "support_adjustments_discussed");
  add("outcome", "meeting_outcome", 80);
  add("warning", "warning_issued", 40);
  add("targets", "improvement_targets");
  add("review date", "review_date", 20);
  return bits.join(". ");
}

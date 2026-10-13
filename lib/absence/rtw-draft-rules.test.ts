import test from "node:test";
import assert from "node:assert/strict";

import {
  FIT_NOTE_QUESTION,
  FULLY_FIT_QUESTION,
  WORK_CAUSE_QUESTION,
  calendarDays,
  checkRtwDraft,
  checkRtwSummary,
  mentionsOtherAbsence,
  needsFitNote,
  reasonInWords,
  rtwDraftPrompt,
  selfCertQuestion,
  workCauseApplies,
  type DraftQuestion,
  type RtwAbsence,
} from "./rtw-draft-rules.ts";

const COLD: RtwAbsence = {
  startDate: "2026-10-10",
  endDate: "2026-10-12",
  reason: "Cold or flu (said they have the sniffles and feel weak and achy)",
};

/** The Thistle draft that started this (2026-10-13), word for word. */
const THE_TICKET_DRAFT: DraftQuestion[] = [
  { type: "yes_no", question: "Do you feel fully fit to return to your normal duties today?" },
  { type: "text", question: "Can you tell me more about the symptoms you had with this cold or flu?" },
  { type: "yes_no", followUp: "fit_note", question: "Do you have a fit note for this absence?" },
  { type: "yes_no", question: "Was there anything going on at work that caused this absence or made it worse?" },
  { type: "text", question: "Looking back at the single days in April and June, can you tell me a bit more about what happened on each of those occasions?" },
  {
    type: "choice",
    options: ["Physical or health reason", "Other reason", "Not sure"],
    question: "Were those earlier absences connected in any way to how you were feeling physically, or were they for other reasons?",
  },
  { type: "yes_no", followUp: "raise", question: "Is there anything else you would like to raise?" },
];

const texts = (qs: DraftQuestion[]) => qs.map((q) => q.question);

test("THE TICKET: the four bad questions go, the good ones stay, self certification is asked", () => {
  const out = checkRtwDraft(THE_TICKET_DRAFT, COLD);
  assert.deepEqual(texts(out.questions), [
    "Do you feel fully fit to return to your normal duties today?",
    "Can you confirm you were unfit for work due to cold or flu from 10 October 2026 to 12 October 2026?",
    "Can you tell me more about the symptoms you had with this cold or flu?",
    "Is there anything else you would like to raise?",
  ]);
  assert.deepEqual(out.removed.sort(), ["fit_note_under_8_days", "other_absence", "other_absence", "work_cause_not_applicable"]);
  assert.equal(out.questions.at(-1)?.followUp, "raise");
});

test("calendar days count weekends and are inclusive", () => {
  assert.equal(calendarDays("2026-10-10", "2026-10-12"), 3);
  assert.equal(calendarDays("2026-10-10", null), 1);
  assert.equal(calendarDays("2026-10-09", "2026-10-15"), 7); // Friday to Thursday, a weekend inside
  assert.equal(calendarDays("2026-10-05", "2026-10-13"), 9);
  assert.equal(calendarDays("2026-10-24", "2026-10-26"), 3); // across the clock change
  assert.equal(calendarDays("2028-02-28", "2028-03-01"), 3); // leap year
});

test("GOV.UK: a fit note only for more than 7 days", () => {
  assert.equal(needsFitNote(7), false);
  assert.equal(needsFitNote(8), true);
});

test("7 days exactly, a weekend inside: still self certification, no fit note", () => {
  const a: RtwAbsence = { startDate: "2026-10-09", endDate: "2026-10-15", reason: "Cold or flu" };
  const out = checkRtwDraft([{ type: "yes_no", followUp: "fit_note", question: "Have you got a doctor's note?" }], a);
  assert.ok(texts(out.questions).includes(selfCertQuestion(a)));
  assert.ok(!out.questions.some((q) => q.followUp === "fit_note"));
});

test("9 days, flu: the fit note question with its upload step, no self certification", () => {
  const a: RtwAbsence = { startDate: "2026-10-05", endDate: "2026-10-13", reason: "Cold or flu (flu)" };
  const out = checkRtwDraft(
    [
      { type: "yes_no", question: "Can you confirm you were unfit for work from 5 October to 13 October?" },
      { type: "text", question: "How are you feeling now?" },
    ],
    a,
  );
  const fn = out.questions.find((q) => q.followUp === "fit_note");
  assert.equal(fn?.question, FIT_NOTE_QUESTION);
  assert.equal(fn?.type, "yes_no");
  assert.ok(!out.questions.some((q) => /unfit for work/.test(q.question)));
  assert.deepEqual(out.removed, ["self_cert_over_7_days"]);
});

test("5 days, stress: the work cause question is kept, or added", () => {
  const a: RtwAbsence = { startDate: "2026-10-05", endDate: "2026-10-09", reason: "Stress or mental health" };
  const kept = checkRtwDraft([{ type: "yes_no", question: "Did anything at work contribute to how you were feeling?" }], a);
  assert.ok(texts(kept.questions).includes("Did anything at work contribute to how you were feeling?"));
  const added = checkRtwDraft([{ type: "text", question: "How are you feeling now?" }], a);
  assert.ok(texts(added.questions).includes(WORK_CAUSE_QUESTION));
  assert.ok(added.added.includes("work_cause"));
});

test("10 days, back injury: fit note AND work cause", () => {
  const a: RtwAbsence = { startDate: "2026-10-01", endDate: "2026-10-10", reason: "Back or muscle pain (hurt their back)" };
  const out = checkRtwDraft([], a);
  assert.ok(out.questions.some((q) => q.followUp === "fit_note"));
  assert.ok(texts(out.questions).includes(WORK_CAUSE_QUESTION));
  assert.ok(texts(out.questions).includes(FULLY_FIT_QUESTION));
  assert.equal(out.questions.at(-1)?.followUp, "raise");
});

test("rule D: work cause only when the reason points to work", () => {
  for (const r of ["Stress or mental health", "Injury (twisted ankle)", "Back or muscle pain", "Other (anxiety)", "Other (low mood)", "Other (an accident on the way in)", "Other (hurt at work)"]) {
    assert.equal(workCauseApplies(r), true, r);
  }
  for (const r of ["Cold or flu", "Sickness and diarrhoea", "Stomach upset", "Headache or migraine", "Other (chest infection)", "Dental", null]) {
    assert.equal(workCauseApplies(r), false, String(r));
  }
});

test("rule A: other dates, months, patterns and stages are caught; the absence's own are not", () => {
  const no = [
    "What happened in April?",
    "Can you tell me about your previous absences?",
    "Have you noticed any pattern in your sickness?",
    "How many occasions have you been off?",
    "You have reached Stage 1, how do you feel about that?",
    "Was your absence on 3/6/2026 related?",
    "Is this linked to what happened earlier this year?",
    "Is this connected to the trigger points?",
    "Were you also off in May?",
    "What happened on 3 May?",
  ];
  for (const q of no) assert.equal(mentionsOtherAbsence(q, COLD), true, q);
  const yes = [
    "How are you feeling after your cold in October?",
    "Can you confirm you were unfit for work from 10 October 2026 to 12 October 2026?",
    "Were you off from 10/10/2026 to 12/10/2026?",
    "Is there anything else you would like to raise?",
    "Are you still infectious around the people you support?",
    "May I ask how you are now?",
  ];
  for (const q of yes) assert.equal(mentionsOtherAbsence(q, COLD), false, q);
});

test("rule E: fully fit is always first and anything else always last; support stays out", () => {
  const out = checkRtwDraft(
    [
      { type: "text", question: "How are you feeling now?" },
      { type: "yes_no", followUp: "need", question: "Is there any support you need?" },
    ],
    COLD,
  );
  assert.equal(out.questions[0].question, FULLY_FIT_QUESTION);
  assert.equal(out.questions.at(-1)?.followUp, "raise");
  assert.ok(!out.questions.some((q) => /support/i.test(q.question)));
  assert.ok(out.removed.includes("support_or_adjustment"));
});

test("the question limit never cuts a required question", () => {
  const many: DraftQuestion[] = Array.from({ length: 12 }, (_, i) => ({ type: "text", question: `Tailored question ${i + 1}?` }));
  const a: RtwAbsence = { startDate: "2026-10-01", endDate: "2026-10-10", reason: "Injury" };
  const out = checkRtwDraft(many, a, 8);
  assert.equal(out.questions.length, 8);
  assert.equal(out.questions[0].question, FULLY_FIT_QUESTION);
  assert.equal(out.questions[1].followUp, "fit_note");
  assert.equal(out.questions[2].question, WORK_CAUSE_QUESTION);
  assert.equal(out.questions.at(-1)?.followUp, "raise");
});

test("no dashes in question text", () => {
  const out = checkRtwDraft([{ type: "text", question: "How are you now - fully recovered?" }], COLD);
  assert.ok(texts(out.questions).includes("How are you now, fully recovered?"));
});

test("the self certification question names the reason and the dates, or just the dates", () => {
  assert.equal(
    selfCertQuestion({ startDate: "2026-10-10", endDate: "2026-10-10", reason: "Headache or migraine" }),
    "Can you confirm you were unfit for work due to headache or migraine on 10 October 2026?",
  );
  assert.equal(
    selfCertQuestion({ startDate: "2026-10-10", endDate: "2026-10-11", reason: "Felt unwell" }),
    "Can you confirm you were unfit for work from 10 October 2026 to 11 October 2026?",
  );
  assert.equal(reasonInWords("Cold or flu (sniffles); Headache or migraine"), "cold or flu and headache or migraine");
});

test("the summary keeps only sentences about this absence", () => {
  const out = checkRtwSummary(
    "The employee was absent from 10 to 12 October 2026 with cold or flu symptoms. Their record also shows two single day absences earlier in the year, in April and June.",
    COLD,
  );
  assert.equal(out.summary, "The employee was absent from 10 to 12 October 2026 with cold or flu symptoms.");
  assert.equal(out.removed, 1);
});

test("rule A, the input: the AI is given this absence only, and the right fit note and work lines", () => {
  const p = rtwDraftPrompt(COLD);
  assert.match(p, /First day of absence: 10 October 2026/);
  assert.match(p, /Last day of absence: 12 October 2026/);
  assert.match(p, /Calendar days: 3/);
  assert.match(p, /do NOT ask about a fit note/);
  assert.match(p, /do NOT ask whether work caused it/);
  assert.doesNotMatch(p, /other absences|Stage|Bradford|occasions/i);
  const back = rtwDraftPrompt({ startDate: "2026-10-01", endDate: "2026-10-10", reason: "Injury" });
  assert.match(back, /Calendar days: 10/);
  assert.match(back, /ask whether they have one/);
  assert.match(back, /ask one question about whether anything at work caused it/);
});

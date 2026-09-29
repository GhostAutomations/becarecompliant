import { test } from "node:test";
import assert from "node:assert/strict";
import {
  followUpLabel, followUpPrompt, inferFollowUp, isAiFollowUp, needsDetail,
  withRequiredFollowUps, SUPPORT_QUESTION, RAISE_QUESTION,
} from "./ai-follow-ups.ts";

test("inferFollowUp recognises the three by wording", () => {
  assert.equal(inferFollowUp("Have you got a fit note from your GP?"), "fit_note");
  assert.equal(inferFollowUp("Do you have a doctor's note?"), "fit_note");
  assert.equal(inferFollowUp("Is there anything else you would like to raise?"), "raise");
  assert.equal(inferFollowUp("Is there any support that would help you now?"), "need");
  assert.equal(inferFollowUp("Would any adjustments help?"), "need");
  assert.equal(inferFollowUp("Do you feel fit to return to your normal duties?"), null);
});

test("the fit note wins over support when a question mentions both", () => {
  assert.equal(inferFollowUp("Would it help to bring your fit note?"), "fit_note");
});

test("prompts and labels", () => {
  assert.equal(followUpPrompt("need"), "What do you need?");
  assert.equal(followUpPrompt("raise"), "What would you like to raise?");
  assert.equal(followUpPrompt("fit_note"), null);
  assert.equal(followUpLabel("need"), "What they need");
  assert.equal(followUpLabel(null), null);
});

test("needsDetail only for a Yes to need or raise", () => {
  assert.equal(needsDetail("need", "Yes"), true);
  assert.equal(needsDetail("raise", " Yes "), true);
  assert.equal(needsDetail("need", "No"), false);
  assert.equal(needsDetail("fit_note", "Yes"), false);
  assert.equal(needsDetail(undefined, "Yes"), false);
});

test("isAiFollowUp", () => {
  assert.equal(isAiFollowUp("need"), true);
  assert.equal(isAiFollowUp("other"), false);
});

type Q = { question: string; type: string; followUp?: "fit_note" | "need" | "raise" };
const make = (question: string, followUp: "need" | "raise" | "fit_note"): Q => ({ question, type: "yes_no", followUp });

test("withRequiredFollowUps adds the support and anything else questions when missing", () => {
  const out = withRequiredFollowUps<Q>([{ question: "How are you feeling?", type: "text" }], make);
  assert.deepEqual(out.map((q) => q.followUp ?? null), [null, "need", "raise"]);
  assert.equal(out[1].question, SUPPORT_QUESTION);
  assert.equal(out[2].question, RAISE_QUESTION);
});

test("withRequiredFollowUps keeps the AI's own and moves anything else to the end", () => {
  const out = withRequiredFollowUps<Q>([
    { question: "Anything else?", type: "yes_no", followUp: "raise" },
    { question: "Any support?", type: "yes_no", followUp: "need" },
    { question: "How are you?", type: "text" },
  ], make);
  assert.deepEqual(out.map((q) => q.question), ["Any support?", "How are you?", "Anything else?"]);
});

test("withRequiredFollowUps leaves a complete set alone", () => {
  const set: Q[] = [
    { question: "Fit note?", type: "yes_no", followUp: "fit_note" },
    { question: "Any support?", type: "yes_no", followUp: "need" },
    { question: "Anything else?", type: "yes_no", followUp: "raise" },
  ];
  assert.deepEqual(withRequiredFollowUps<Q>(set, make), set);
});

test("withRequiredFollowUps stays within the limit by dropping the last plain questions", () => {
  const plain: Q[] = Array.from({ length: 8 }, (_, i) => ({ question: `Q${i + 1}`, type: "text" }));
  const out = withRequiredFollowUps<Q>(plain, make, 8);
  assert.equal(out.length, 8);
  assert.deepEqual(out.slice(0, 6).map((q) => q.question), ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
  assert.deepEqual(out.slice(6).map((q) => q.followUp), ["need", "raise"]);
});

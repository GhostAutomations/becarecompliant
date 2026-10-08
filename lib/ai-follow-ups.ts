/**
 * Follow ups on AI drafted Yes/No questions (Phil, 2026-09-29, Absence round 2 item 5).
 *
 *   fit_note  "Do you have a fit note?" A Yes asks them to upload it there and then.
 *   need      "Is there any support that would help?" A Yes asks "What do you need?". No longer
 *             asked (Phil, 2026-10-08); kept so sets saved before then still read back.
 *   raise     "Is there anything else you would like to raise?" A Yes asks "What would you like
 *             to raise?".
 *
 * The AI marks them when it drafts. A set drafted before that is recognised by its wording, so the
 * portal still asks the follow up. Pure: used by the drafting code, the portal and the manager's
 * dialog alike.
 */

export type AiFollowUp = "fit_note" | "need" | "raise";

export function isAiFollowUp(v: unknown): v is AiFollowUp {
  return v === "fit_note" || v === "need" || v === "raise";
}

/** Recognise a follow up from the question's wording. Yes/No questions only. */
export function inferFollowUp(question: string): AiFollowUp | null {
  const q = question.toLowerCase();
  if (/\b(fit note|sick note|doctor'?s note|statement of fitness)\b/.test(q)) return "fit_note";
  if (/\banything else\b/.test(q)) return "raise";
  if (/\b(support|adjustments?|help)\b/.test(q)) return "need";
  return null;
}

/** The question asked under a Yes. */
export function followUpPrompt(f: AiFollowUp | null | undefined): string | null {
  if (f === "need") return "What do you need?";
  if (f === "raise") return "What would you like to raise?";
  return null;
}

/** How the extra answer reads back in Evidence. */
export function followUpLabel(f: AiFollowUp | null | undefined): string | null {
  if (f === "need") return "What they need";
  if (f === "raise") return "What they want to raise";
  return null;
}

/** True when this answer needs the extra box. */
export function needsDetail(f: AiFollowUp | null | undefined, answer: string | null | undefined): boolean {
  return (f === "need" || f === "raise") && (answer ?? "").trim() === "Yes";
}

export const RAISE_QUESTION = "Is there anything else you would like to raise?";

/** A question about adjustments, support or changing their hours (Phil, 2026-10-08, all
 *  companies): never asked in a Return to Work, because asked of everyone it invites a flexible
 *  working request after every absence. Sets saved before this keep theirs. */
const ADJUSTMENT_RE =
  /\b(adjustments?|support|availability|flexib\w*|phased return|working (hours|pattern)|your (hours|shifts|rota)|reduced hours)\b/i;
export function isAdjustmentQuestion(q: { question: string; followUp?: AiFollowUp }): boolean {
  return q.followUp === "need" || ADJUSTMENT_RE.test(q.question);
}

/** THE ONE THAT IS ALWAYS ASKED: an anything else question, last (Phil, 2026-09-29). The AI is
 *  told to write it; if a draft comes back without it, it is added here. Any adjustment or support
 *  question the AI wrote anyway is taken out (Phil, 2026-10-08: the support question is no longer
 *  asked). The set is kept within `limit` by dropping the last questions that are not follow ups. */
export function withRequiredFollowUps<
  Q extends { question: string; type: string; followUp?: AiFollowUp },
>(questions: Q[], make: (question: string, followUp: AiFollowUp) => Q, limit = Infinity): Q[] {
  const out = questions.filter((q) => !isAdjustmentQuestion(q));
  const raiseAt = out.findIndex((q) => q.type === "yes_no" && q.followUp === "raise");
  const raise = raiseAt >= 0 ? out.splice(raiseAt, 1)[0] : make(RAISE_QUESTION, "raise");
  out.push(raise);
  // Stay within the question limit (the saved set is read back through the same cap, which would
  // otherwise cut the anything else question off the end): drop the last untagged questions.
  for (let i = out.length - 1; out.length > limit && i >= 0; i--) {
    if (!out[i].followUp) out.splice(i, 1);
  }
  return out;
}

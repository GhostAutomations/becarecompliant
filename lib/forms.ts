/**
 * Shared server-action result shape for useActionState forms.
 * redirectTo: when set, the client navigates there with router.replace after the
 * action resolves. We do NOT call next/navigation redirect() inside these actions:
 * redirecting to a URL with a query string from a Server Action trips a known
 * Next.js 15 App Router bug (issue #78396 / React #310, "Rendered more hooks than
 * during the previous render") in the router's searchParams useMemo. Client-side
 * navigation avoids that transition entirely.
 */
export type ActionState = {
  ok?: string;
  error?: string;
  redirectTo?: string;
  /** Optional values an action wants to hand back to the form it was called from,
   *  e.g. an AI draft the user then edits before saving. Presentational only: never
   *  put anything the server must trust on the way back in here. */
  data?: Record<string, string>;
};

export const IDLE_STATE: ActionState = {};

/**
 * AI DRAFTED QUESTIONS (Phase 10, Return to Work v3).
 *
 * A Form's fields are fixed by its published version, because Evidence pins a
 * form_version id and the server validates every answer against that STORED schema.
 * So an AI cannot invent a field: the server has never seen the key and drops it, and
 * minting a version per record would wreck the audit trail.
 *
 * The way round it, without touching the form engine: the action returns a small set of
 * questions as JSON, the dialog renders each as a real labelled control, and the whole
 * set is written into ONE existing long_text answer as readable text. Everything
 * downstream (Evidence, the PDF, exports, the on screen view) already handles a
 * long_text answer, so nothing downstream changes.
 *
 * Isomorphic on purpose: the Server Action validates the model's reply with the same
 * code the browser parses it with.
 */
export type AiQuestionType = "text" | "yes_no" | "choice";

export type AiQuestion = {
  question: string;
  type: AiQuestionType;
  /** Only for type "choice". Two or more short answers to choose from. */
  options?: string[];
};

/** Most questions we ever want to put in front of someone in one sitting.
 *  Raised from 6 to 8 for Return to Work v4 (migration 0148): the drafted set now has
 *  to cover the ground the fixed "The conversation" fields used to, on top of whatever
 *  this particular record calls for. It stops at 8 on purpose. A manager will not work
 *  through twenty, and a set nobody finishes is worse than a shorter one they do. */
export const AI_QUESTION_LIMIT = 8;
const AI_OPTION_LIMIT = 6;

/** Models like to wrap JSON in a markdown fence however firmly you ask them not to. */
export function stripJsonFence(raw: string): string {
  let text = (raw ?? "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\s*/, "");
    const end = text.lastIndexOf("```");
    if (end !== -1) text = text.slice(0, end);
  }
  return text.trim();
}

/**
 * Turn whatever the model produced into questions we are willing to render. Anything
 * malformed is DROPPED rather than repaired: a half understood question in front of an
 * employee is worse than one question fewer. Returns [] when nothing survives, which is
 * the caller's signal to fall back.
 */
export function toAiQuestions(value: unknown): AiQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: AiQuestion[] = [];
  for (const entry of value) {
    if (out.length >= AI_QUESTION_LIMIT) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const question = typeof row.question === "string" ? row.question.trim() : "";
    if (!question) continue;
    const rawType = typeof row.type === "string" ? row.type.trim().toLowerCase() : "";
    let type: AiQuestionType =
      rawType === "yes_no" || rawType === "choice" ? rawType : "text";
    let options: string[] | undefined;
    if (type === "choice") {
      options = (Array.isArray(row.options) ? row.options : [])
        .filter((o): o is string => typeof o === "string" && o.trim() !== "")
        .map((o) => o.trim())
        .slice(0, AI_OPTION_LIMIT);
      // A choice with nothing to choose between is just a question. Keep it, ask it
      // as text, rather than throwing away a question that may be the important one.
      if (options.length < 2) {
        type = "text";
        options = undefined;
      }
    }
    out.push(options ? { question, type, options } : { question, type });
  }
  return out;
}

/**
 * Parse a JSON payload of questions. Accepts either a bare array or an object with a
 * "questions" array. NEVER throws: bad JSON returns [].
 */
export function parseAiQuestions(raw: string): AiQuestion[] {
  if (!raw || typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return toAiQuestions(parsed);
  if (parsed && typeof parsed === "object") {
    return toAiQuestions((parsed as Record<string, unknown>).questions);
  }
  return [];
}

/**
 * Serialise the questions and their answers into ONE readable long_text answer. Readable
 * text, not JSON, because this is what a manager, an inspector or a tribunal reads back
 * out of Evidence years later.
 */
export function serialiseAiQuestions(questions: AiQuestion[], answers: string[]): string {
  return questions
    .map((q, i) => {
      const answer = (answers[i] ?? "").trim();
      return `Q: ${q.question}\nA: ${answer}`.trimEnd();
    })
    .join("\n\n");
}

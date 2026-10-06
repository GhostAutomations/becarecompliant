/**
 * "[To be completed: ...]" in an AI draft (Phil, 2026-10-06): rather than hunting for square
 * brackets in the text, each one becomes its own field under the policy, and the answer is put
 * into the wording on save. Pure, so it can be tested and used on both sides.
 */

const PLACEHOLDER = /\[To be completed(?::\s*([^\]]*))?\]/gi;

/** The things still to complete, once each, in the order they first appear. */
export function findPlaceholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) {
    const ask = (m[1] ?? "").trim() || "Missing detail";
    if (!out.includes(ask)) out.push(ask);
  }
  return out;
}

/** Put each answer in place of its placeholder. A blank answer leaves the placeholder there. */
export function fillPlaceholders(text: string, answers: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, ask: string | undefined) => {
    const key = (ask ?? "").trim() || "Missing detail";
    const a = (answers[key] ?? "").trim();
    return a ? a : whole;
  });
}

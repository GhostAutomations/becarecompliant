/**
 * Be Care Compliant — turning a refused set of answers into a sentence that helps.
 *
 * Isomorphic and dependency free on purpose (a type import only): the message the
 * server hands back has to be reasoned about in a test, not just read in review.
 */

import type { FormSchema } from "@/lib/form-schema";

/** The shape lib/form-validate.ts produces. Restated rather than imported so this
 *  module pulls in no runtime code. */
export type ValidationFieldError = { key: string; message: string };

/**
 * A message that NAMES what is wrong, for a caller that cannot highlight the field.
 *
 * WHY THIS EXISTS. Found in testing on 2026-08-11: completing Supervision 4 returned
 * "Please correct the highlighted fields" with NO highlighted field anywhere on the
 * page, because the page hides the "Which supervision" question and supplies the value
 * from the button clicked, while the server validates the WHOLE published form. The
 * browser passed its own check, the server refused, and the manager was left with an
 * error and nothing to correct. A dead end.
 *
 * The specific form bug is fixed separately (migration 0170). This is the general
 * guard: whenever the server refuses answers, it says which answers and why, so a
 * mismatch between what a page renders and what the form actually contains can never
 * again present as an unexplainable failure. Safety in the function, not in the page.
 *
 * Capped at `limit` named fields so the message stays readable; the rest are counted.
 */
export function describeValidationErrors(
  schema: FormSchema,
  errors: ValidationFieldError[],
  limit = 3,
): string {
  if (errors.length === 0) return "Please correct the highlighted fields.";
  // Flattened inline rather than through flattenFields, so this module needs only a
  // TYPE import and stays unit testable under the repo's type stripping test runner.
  const labels = new Map<string, string>();
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) labels.set(field.key, field.label);
  }
  const named = errors
    .slice(0, limit)
    .map((e) => `${labels.get(e.key) ?? e.key} (${e.message.replace(/\.$/, "").toLowerCase()})`)
    .join(", ");
  const rest = errors.length - Math.min(errors.length, limit);
  const more = rest > 0 ? ` And ${rest} more.` : "";
  return `Please correct these answers: ${named}.${more}`;
}


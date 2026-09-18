"use server";

/**
 * Be Care Compliant — the browser's three doors to a part-finished Form.
 *
 * Thin Server Action wrappers over lib/forms/draft-store.ts, which holds the work
 * so the completion actions can discard a draft without going back out through the
 * browser. All three are silent on failure and return nothing worth acting on: a
 * draft is a safety net, never a step in filing a form.
 */

import type { Answers } from "@/lib/form-schema";
import { dropDraft, readDraft, writeDraft } from "@/lib/forms/draft-store";

/** Hand back what this user last typed into this form, within twelve hours. */
export async function loadFormDraft(key: string): Promise<Answers | null> {
  return readDraft(key);
}

/** Autosave (debounced by the caller, fire and forget). */
export async function saveFormDraft(key: string, answers: Answers): Promise<void> {
  await writeDraft(key, answers);
}

/** Discard -- the form was filed, or deliberately abandoned. */
export async function clearFormDraft(key: string): Promise<void> {
  await dropDraft(key);
}

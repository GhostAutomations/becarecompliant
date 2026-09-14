/**
 * Be Care Compliant — the form builder may not move the scoring.
 *
 * Phil, 2026-09-12: the customer satisfaction questions "should only be editable in there
 * settings to protect the scoring mechanism".
 *
 * In the builder a scored question looks like any other yes/no. Somebody tidying the
 * Individual Plan Review would reword it, drag it out of its section or delete it, and would
 * have changed the percentage that goes to the regulator without ever being told. So a draft
 * that alters them is refused, and the message says where to go instead.
 *
 * WHAT IS PROTECTED is the question itself: whether it is scored, and the words it asks.
 * Everything else about the form stays the builder's to arrange — a company can still move
 * the section, edit the guidance around it, and change every other question on the page.
 *
 * Pure and isomorphic, so the same rule can guard the server action and, later, grey the
 * fields out on screen.
 */

import type { FormField, FormSchema } from "@/lib/form-schema";

function scored(schema: FormSchema): Map<string, FormField> {
  const out = new Map<string, FormField>();
  for (const s of schema.sections ?? []) {
    for (const f of s.fields ?? []) if (f.satisfaction === true) out.set(f.key, f);
  }
  return out;
}

/**
 * What a proposed draft would do to the scored questions, in plain words.
 * Empty array means the draft leaves them alone and may be saved.
 */
export function satisfactionEditsIn(current: FormSchema, next: FormSchema): string[] {
  const before = scored(current);
  const after = scored(next);
  const problems: string[] = [];

  for (const [key, f] of before) {
    const now = after.get(key);
    if (!now) {
      problems.push(`"${f.label}" would be removed`);
      continue;
    }
    if (now.label !== f.label) {
      problems.push(`"${f.label}" would be reworded`);
    }
  }
  for (const [key, f] of after) {
    if (!before.has(key)) problems.push(`"${f.label}" would be added as a scored question`);
  }
  return problems;
}

/** The sentence shown when a draft is refused. Written once so every caller says the same. */
export function satisfactionRefusal(problems: string[]): string {
  return `${problems.join("; ")}. Customer satisfaction questions are edited in Settings, Service users, Customer Satisfaction, so that the PQS score cannot be changed by editing a form.`;
}

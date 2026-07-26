/**
 * Be Care Compliant — what the PUBLIC page renders.
 *
 * The public page already asks for the person's full name and personal email at
 * the top, because that is how a submission is matched to a record. A company
 * form that also asks for an email (the Holiday form does, it came from Phil's
 * Monday form) would then ask the same question twice, so that question is
 * dropped from the RENDER.
 *
 * Render-side only, the same pattern as removeField and fieldToNameSelect: the
 * STORED form version is untouched, so server validation still runs against the
 * exact form on file, and the submit path seeds the identity email back into the
 * dropped question, so the Evidence is complete either way.
 *
 * A REQUIRED question is never dropped. If a company ever builds a public form
 * with a required email question, it stays visible rather than becoming an
 * invisible reason the form will not send.
 *
 * Isomorphic: no side effects, safe to import anywhere.
 */

import { removeField, type FormSchema } from "@/lib/form-schema";

function asksForEmail(key: string, label: string): boolean {
  return key.includes("email") || label.includes("email");
}

/** The schema to show on the public page: the stored form minus the duplicates. */
export function publicRenderSchema(schema: FormSchema): FormSchema {
  let out = schema;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.required) continue;
      const key = (field.key ?? "").toLowerCase();
      const label = (field.label ?? "").toLowerCase();
      if (asksForEmail(key, label)) out = removeField(out, field.key);
    }
  }
  return out;
}

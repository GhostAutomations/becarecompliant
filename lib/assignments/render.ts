/**
 * Be Care Compliant — what a BRIEFING form shows to the person completing it.
 *
 * A briefing is always completed by somebody the app has already identified: they are logged in,
 * the assignment names their record, and the screen above the form literally says "Hello,
 * Charlotte. Care Assistant, Newport1". Asking them to type their own name, their own email and
 * pick their own branch is asking a question the app already knows the answer to, and the answer
 * they type is free text that can disagree with their record.
 *
 * That is the same problem lib/public-forms/render.ts solves for the no login page, and this is
 * the same shape of solution: RENDER SIDE ONLY. The stored form version is untouched, so server
 * validation still runs against the exact form on file, and the submit path seeds the identity
 * back into the dropped questions so the Evidence is complete either way.
 *
 * A REQUIRED question is NEVER dropped. If a company builds a form with a required name box, it
 * stays visible rather than becoming an invisible reason the form will not send.
 *
 * Isomorphic: no side effects, safe to import anywhere.
 */

import type { Answers, FormSchema } from "@/lib/form-schema";

/**
 * Deliberately IMPORTLESS at runtime (types are erased), so this module is a unit test target:
 * `node --experimental-strip-types` resolves neither path aliases nor extensionless files, so one
 * value import of removeField would break the whole test run. This is that same eight line drop,
 * kept in step with lib/form-schema.ts removeField.
 */
function withoutField(schema: FormSchema, key: string): FormSchema {
  return {
    ...schema,
    sections: (schema.sections ?? []).map((s) => ({
      ...s,
      fields: (s.fields ?? []).filter((f) => f.key !== key),
    })),
  };
}

/** What the app can fill in on the person's behalf. */
export type KnownIdentity = {
  fullName: string | null;
  email: string | null;
};

type Kind = "name" | "email" | "branch";

/**
 * Which identity question, if any, this field is.
 *
 * Deliberately TIGHT. "Name" and "Your name" are the person; "Name of the person you supported"
 * and "Manager conducting meeting" are not, and getting that wrong would blank a real answer on a
 * supervision or a spot check. So a name question must be the whole label, not a label that
 * merely contains the word.
 */
export function identityKind(key: string, label: string): Kind | null {
  const k = (key ?? "").toLowerCase().trim();
  const l = (label ?? "").toLowerCase().trim().replace(/[?.:]+$/, "");

  if (k === "name" || l === "name" || l === "your name" || l === "full name" || l === "your full name") {
    return "name";
  }
  if (k.includes("email") || l.includes("email address") || l === "email") return "email";
  if (
    k.includes("what_area") ||
    k === "area" ||
    k === "branch" ||
    l === "branch" ||
    l === "what area do you work for" ||
    l === "which area do you work for" ||
    l === "what branch do you work for"
  ) {
    return "branch";
  }
  return null;
}

/** The schema to SHOW a logged in person completing a briefing: the stored form minus the
 *  questions the app can answer for them. */
export function briefingRenderSchema(schema: FormSchema): FormSchema {
  let out = schema;
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.required) continue;
      if (identityKind(field.key, field.label)) out = withoutField(out, field.key);
    }
  }
  return out;
}

/**
 * The answers to seed back before the Evidence is written, so the record still names the person
 * even though they were not asked. Only fills a question that is EMPTY, so a form that legitimately
 * asked and got an answer is never overwritten.
 *
 * BRANCH IS DROPPED BUT NEVER SEEDED. That question is a company authored dropdown whose options
 * are free text and need not match the branch names at all: the live Holiday form offers "Newport"
 * and "Cardiff" while the carer's branch is "Newport1". Writing the real branch name into it would
 * be an option that does not exist, and validation refuses those outright ("Choose one of the
 * options"), so the form would stop sending. The Evidence row carries the person's REAL branch on
 * itself, which is the value anything downstream reads.
 */
export function seedIdentityAnswers(
  schema: FormSchema,
  answers: Answers,
  who: KnownIdentity,
): Answers {
  const out = { ...answers };
  for (const section of schema.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.required) continue;
      const kind = identityKind(field.key, field.label);
      if (kind !== "name" && kind !== "email") continue;
      const existing = out[field.key];
      if (existing != null && String(existing).trim() !== "") continue;
      const value = kind === "name" ? who.fullName : who.email;
      if (value) out[field.key] = value;
    }
  }
  return out;
}

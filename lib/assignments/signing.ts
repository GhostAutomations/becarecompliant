/**
 * Be Care Compliant — how a policy gets signed.
 *
 * Phil's decision, 2026-07-26: the signing METHOD is the company's to choose, so
 * the acknowledgement form carries BOTH a drawn signature field and a typed one,
 * and this filters the render to whichever the company asked for. Render-side
 * only, the same pattern as removeField and publicRenderSchema: the STORED form
 * is untouched, so server validation never diverges from what was published.
 *
 * Isomorphic (no side effects), so both the page and the action can use it.
 */

import { removeField, type Answers, type FormSchema } from "@/lib/form-schema";

export type SignatureMode = "draw" | "type" | "either";
export type ReassignMode = "always" | "ask" | "never";

export const SIGNATURE_MODE_LABELS: Record<SignatureMode, string> = {
  draw: "Draw a signature",
  type: "Type their full name",
  either: "Draw or type, their choice",
};

export const REASSIGN_MODE_LABELS: Record<ReassignMode, string> = {
  always: "Everyone signs the new version automatically",
  ask: "Ask me each time I upload a version",
  never: "Never reassign, I will do it myself",
};

export const DRAWN_KEY = "signature";
export const TYPED_KEY = "signature_typed";

/** The acknowledgement form as this company signs it. */
export function signingSchema(schema: FormSchema, mode: SignatureMode): FormSchema {
  // The policy, its version and the date are all stamped by the server, so they
  // are never asked of the person signing.
  let out = removeField(removeField(removeField(schema, "policy"), "policy_version"), "read_date");
  out = removeField(out, "name");
  if (mode === "draw") out = removeField(out, TYPED_KEY);
  if (mode === "type") out = removeField(out, DRAWN_KEY);
  return out;
}

/**
 * Did they actually sign? Enforced here rather than by a required flag, because
 * the requirement depends on the company's mode and the stored schema is shared.
 */
export function signatureGiven(
  answers: Answers,
  mode: SignatureMode,
): { ok: true } | { ok: false; error: string } {
  const drawn = typeof answers[DRAWN_KEY] === "string" ? (answers[DRAWN_KEY] as string).trim() : "";
  const typed = typeof answers[TYPED_KEY] === "string" ? (answers[TYPED_KEY] as string).trim() : "";

  if (mode === "draw") {
    return drawn ? { ok: true } : { ok: false, error: "Please sign in the box to confirm." };
  }
  if (mode === "type") {
    return typed.length >= 3
      ? { ok: true }
      : { ok: false, error: "Type your full name to sign." };
  }
  if (drawn || typed.length >= 3) return { ok: true };
  return { ok: false, error: "Sign in the box, or type your full name." };
}

/** How the signature reads on the certificate. */
export function signatureLabel(answers: Answers): "drawn" | "typed" | "none" {
  const drawn = typeof answers[DRAWN_KEY] === "string" ? (answers[DRAWN_KEY] as string).trim() : "";
  const typed = typeof answers[TYPED_KEY] === "string" ? (answers[TYPED_KEY] as string).trim() : "";
  if (drawn) return "drawn";
  if (typed) return "typed";
  return "none";
}

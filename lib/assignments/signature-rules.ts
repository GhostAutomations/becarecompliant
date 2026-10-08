/**
 * Be Care Compliant — the signing rules with no imports, so they can be tested directly
 * (node --experimental-strip-types resolves no aliases). lib/assignments/signing re-exports them.
 */

type Answers = Record<string, unknown>;

export type SignatureMode = "draw" | "type" | "either" | "both";

export const SIGNATURE_MODES: SignatureMode[] = ["draw", "type", "either", "both"];
export type ReassignMode = "always" | "ask" | "never";

export const SIGNATURE_MODE_LABELS: Record<SignatureMode, string> = {
  draw: "Draw a signature",
  type: "Type their full name",
  either: "Draw or type, their choice",
  // Phil, 2026-10-08: some policies want a drawn signature AND the name typed beside it.
  both: "Draw and type, both needed",
};

export const REASSIGN_MODE_LABELS: Record<ReassignMode, string> = {
  always: "Everyone signs the new version automatically",
  // Honest since 2026-07-27: this used to behave exactly like "never" because the
  // asking half was never built. Now a new version tells you how many people hold
  // the old one and leaves the "Ask everyone to sign it" button ready.
  ask: "Tell me who holds the old version, I decide",
  never: "Nobody is asked again unless I say so",
};

export const DRAWN_KEY = "signature";
export const TYPED_KEY = "signature_typed";

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
  if (mode === "both") {
    if (!drawn && typed.length < 3) return { ok: false, error: "Sign in the box and type your full name." };
    if (!drawn) return { ok: false, error: "Please sign in the box as well." };
    if (typed.length < 3) return { ok: false, error: "Type your full name as well." };
    return { ok: true };
  }
  if (drawn || typed.length >= 3) return { ok: true };
  return { ok: false, error: "Sign in the box, or type your full name." };
}

/** How the signature reads on the signed copy. */
export function signatureLabel(answers: Answers): "drawn" | "typed" | "none" {
  const drawn = typeof answers[DRAWN_KEY] === "string" ? (answers[DRAWN_KEY] as string).trim() : "";
  const typed = typeof answers[TYPED_KEY] === "string" ? (answers[TYPED_KEY] as string).trim() : "";
  if (drawn) return "drawn";
  if (typed) return "typed";
  return "none";
}

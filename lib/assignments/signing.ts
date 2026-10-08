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

import { removeField, type FormSchema } from "@/lib/form-schema";
import { DRAWN_KEY, TYPED_KEY, type SignatureMode } from "./signature-rules";

export {
  DRAWN_KEY,
  TYPED_KEY,
  REASSIGN_MODE_LABELS,
  SIGNATURE_MODES,
  SIGNATURE_MODE_LABELS,
  signatureGiven,
  signatureLabel,
  type ReassignMode,
  type SignatureMode,
} from "./signature-rules";


/** The acknowledgement form as this company signs it. */
export function signingSchema(schema: FormSchema, mode: SignatureMode): FormSchema {
  // The policy, its version and the date are all stamped by the server, so they
  // are never asked of the person signing.
  let out = removeField(removeField(removeField(schema, "policy"), "policy_version"), "read_date");
  out = removeField(out, "name");
  if (mode === "draw") out = removeField(out, TYPED_KEY);
  if (mode === "type") out = removeField(out, DRAWN_KEY);
  if (mode === "both") {
    /* The stored label reads "Or type your full name", which is wrong when both are needed. */
    out = {
      ...out,
      sections: out.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) => (f.key === TYPED_KEY ? { ...f, label: "And type your full name" } : f)),
      })),
    };
  }
  return out;
}

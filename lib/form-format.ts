/**
 * Be Care Compliant — shared answer formatting (Phase 2).
 *
 * Turns a raw answer value into human-readable text for evidence: used by the
 * PDF evidence renderer now and by reports/exports in Phase 8. Isomorphic.
 * No dashes in customer-facing copy (Phil standing rule): empty answers read
 * "Not answered", never a dash.
 */

import { type AnswerValue, type FormField } from "./form-schema";

/** Map an option value to its label, falling back to the raw value. */
function optionLabel(field: FormField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

/** Human-readable rendering of one answer for a given field. */
export function formatAnswerForDisplay(field: FormField, value: AnswerValue | undefined): string {
  switch (field.type) {
    case "single_select":
    case "radio":
      return value == null || value === "" ? "Not answered" : optionLabel(field, String(value));

    case "multi_select":
      return Array.isArray(value) && value.length
        ? value.map((v) => optionLabel(field, String(v))).join(", ")
        : "None selected";

    case "checkbox":
      return value === true ? "Yes" : "No";

    case "signature":
      return typeof value === "string" && value.trim() !== "" ? "Signature captured" : "Not signed";

    case "file_upload":
      return typeof value === "string" && value.trim() !== "" ? value : "No file attached";

    case "number":
      return value == null || value === "" ? "Not answered" : String(value);

    case "date":
    case "short_text":
    case "long_text":
      return value == null || String(value).trim() === "" ? "Not answered" : String(value);

    default:
      return value == null ? "Not answered" : String(value);
  }
}

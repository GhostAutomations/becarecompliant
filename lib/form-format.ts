/**
 * Be Care Compliant — shared answer formatting (Phase 2).
 *
 * Turns a raw answer value into human-readable text for evidence: used by the
 * PDF evidence renderer now and by reports/exports in Phase 8. Isomorphic.
 * No dashes in customer-facing copy (Phil standing rule): empty answers read
 * "Not answered", never a dash.
 */

import {
  type AnswerValue,
  type FormField,
  addressIsEmpty,
  formatAddress,
  isAddressValue,
  isPackageValue,
} from "./form-schema";
import { CARE_PLAN_SERVICES, CARE_PLAN_UNITS } from "./service-users/care-plan-consts";
import { describePackage, parsePackage } from "./service-users/care-package";
import { ukDate } from "./dates";

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

    /* The package in words, one call a line, because the Evidence and the PDF are what somebody
       reads back in two years. Parsed rather than printed raw so a stored line that no longer
       makes sense is dropped here exactly as it was dropped on the way in. */
    case "care_package": {
      if (!isPackageValue(value)) return "Not answered";
      const lines = parsePackage(value, {
        services: CARE_PLAN_SERVICES,
        units: CARE_PLAN_UNITS,
      });
      if (lines.length === 0) return "No calls";
      return describePackage(lines).split("; ").join("\n");
    }

    case "multi_select":
      return Array.isArray(value) && value.length
        ? value.map((v) => optionLabel(field, String(v))).join(", ")
        : "None selected";

    case "checkbox":
      return value === true ? "Yes" : "No";

    case "yes_no":
      return value === "Yes" || value === "No" ? value : "Not answered";

    case "rating": {
      if (value == null || value === "") return "Not answered";
      const max = field.validation?.max ?? 5;
      return `${Number(value)} of ${max}`;
    }

    case "address":
      return isAddressValue(value) && !addressIsEmpty(value)
        ? formatAddress(value)
        : "Not answered";

    case "time":
    case "email":
    case "phone":
      return value == null || String(value).trim() === "" ? "Not answered" : String(value);

    case "signature":
      return typeof value === "string" && value.trim() !== "" ? "Signature captured" : "Not signed";

    case "file_upload":
      return typeof value === "string" && value.trim() !== "" ? value : "No file attached";

    /* The stored answer IS the record's name, so it reads back as itself for ever -
       after that record is renamed, archived or deleted. */
    case "record_lookup":
      return typeof value === "string" && value.trim() !== "" ? value : "Not answered";

    /* Worked out by the form, and stored with its denominator ("48 of 48") so it still
       reads correctly in an export years later, when nobody has the schema to hand to
       know what it was out of. */
    case "score_total":
    case "score_band":
      return typeof value === "string" && value.trim() !== "" ? value : "Not scored";

    case "number":
      return value == null || value === "" ? "Not answered" : String(value);

    /*
     * A DATE reads as a date. It used to fall through with the text types and print the stored
     * "2026-07-16" verbatim, on the evidence page AND in the PDF, because both render through
     * this one function. That is the document handed to an inspector.
     */
    case "date":
      return value == null || String(value).trim() === "" ? "Not answered" : ukDate(String(value));

    case "short_text":
    case "long_text":
      return value == null || String(value).trim() === "" ? "Not answered" : String(value);

    default:
      return value == null ? "Not answered" : String(value);
  }
}

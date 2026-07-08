/**
 * Be Care Compliant — shared Form validation (Phase 2).
 *
 * The single source of truth for "is this set of answers valid for this schema".
 * Used by BOTH the client renderer (live/pre-submit) AND the server submit path
 * (authoritative, never trust the client). Isomorphic: no server-only imports.
 *
 * Rules:
 *  - Presentational fields (heading) are ignored.
 *  - A field hidden by conditional logic is never required and its answer is
 *    stripped (see cleanAnswers), so users are never trapped behind a hidden
 *    required question.
 *  - required, per-type shape, and per-field validation constraints are checked.
 */

import {
  type Answers,
  type AnswerValue,
  type FormField,
  type FormSchema,
  flattenFields,
  isPresentational,
} from "./form-schema";

export type FieldError = { key: string; message: string };
export type ValidationResult = { ok: boolean; errors: FieldError[] };

/** Is a field visible given the current answers (conditional logic)? */
export function isFieldVisible(field: FormField, answers: Answers): boolean {
  if (!field.visibleWhen) return true;
  const controlling = answers[field.visibleWhen.field];
  if (controlling == null) return false;
  if (Array.isArray(controlling)) {
    return controlling.some((v) => field.visibleWhen!.in.includes(String(v)));
  }
  return field.visibleWhen.in.includes(String(controlling));
}

/** Treat empty string / null / empty array as "no answer". */
function isEmpty(value: AnswerValue | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Return only the answers for fields that are currently visible and collect an
 * answer. Drops answers for hidden or presentational fields so evidence never
 * stores a value the user could not see when submitting.
 */
export function cleanAnswers(schema: FormSchema, answers: Answers): Answers {
  const out: Answers = {};
  for (const field of flattenFields(schema)) {
    if (isPresentational(field.type)) continue;
    if (!isFieldVisible(field, answers)) continue;
    if (field.key in answers) out[field.key] = answers[field.key];
  }
  return out;
}

function validateField(field: FormField, value: AnswerValue | undefined): string | null {
  const required = field.required === true;
  if (isEmpty(value)) {
    return required ? "This field is required." : null;
  }

  switch (field.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return "Enter a number.";
      if (field.validation?.min != null && n < field.validation.min) {
        return `Must be ${field.validation.min} or more.`;
      }
      if (field.validation?.max != null && n > field.validation.max) {
        return `Must be ${field.validation.max} or less.`;
      }
      return null;
    }
    case "date": {
      // Expect ISO yyyy-mm-dd from the date control.
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "Enter a valid date.";
      }
      const d = new Date(value + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return "Enter a valid date.";
      return null;
    }
    case "short_text":
    case "long_text": {
      const s = String(value);
      if (field.validation?.minLength != null && s.length < field.validation.minLength) {
        return `Must be at least ${field.validation.minLength} characters.`;
      }
      if (field.validation?.maxLength != null && s.length > field.validation.maxLength) {
        return `Must be ${field.validation.maxLength} characters or fewer.`;
      }
      if (field.validation?.pattern) {
        try {
          if (!new RegExp(field.validation.pattern).test(s)) return "Invalid format.";
        } catch {
          // A malformed pattern in the schema should not block submission.
        }
      }
      return null;
    }
    case "single_select":
    case "radio": {
      const allowed = (field.options ?? []).map((o) => o.value);
      if (!allowed.includes(String(value))) return "Choose one of the options.";
      return null;
    }
    case "multi_select": {
      if (!Array.isArray(value)) return "Choose from the options.";
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      if (!value.every((v) => allowed.has(String(v)))) return "Choose from the options.";
      return null;
    }
    case "checkbox": {
      if (typeof value !== "boolean") return "Invalid value.";
      // A required checkbox must be ticked (e.g. a confirmation).
      if (required && value !== true) return "This must be confirmed.";
      return null;
    }
    case "signature": {
      if (typeof value !== "string" || value.trim() === "") return "A signature is required.";
      return null;
    }
    case "file_upload": {
      // Answer holds the uploaded file's reference (name/path) as a string.
      if (typeof value !== "string" || value.trim() === "") return "A file is required.";
      return null;
    }
    default:
      return null;
  }
}

/**
 * Validate answers against a schema. Authoritative: the server calls this before
 * writing evidence. Only visible, non-presentational fields are checked.
 */
export function validateAnswers(schema: FormSchema, answers: Answers): ValidationResult {
  const errors: FieldError[] = [];
  for (const field of flattenFields(schema)) {
    if (isPresentational(field.type)) continue;
    if (!isFieldVisible(field, answers)) continue;
    const message = validateField(field, answers[field.key]);
    if (message) errors.push({ key: field.key, message });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Be Care Compliant — Form schema types (Phase 2).
 *
 * The one canonical description of a Form's structure. A Form version stores a
 * FormSchema as jsonb; the shared renderer (components/forms/form-renderer.tsx)
 * and the shared validator (lib/form-validate.ts) both read this shape, and the
 * PDF evidence renderer (lib/evidence/pdf.tsx) renders from it. Nothing else
 * should describe a form. No authoring UI yet (that is Phase 5); this is the
 * contract everything later builds on.
 *
 * Schema shape (agreed with Phil, 2026-07-08): sections, then ordered fields.
 *   { schemaVersion, sections: [ { id, title, description?, fields: [ Field ] } ] }
 *
 * Isomorphic: safe to import from both server and client (no side effects).
 */

export type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "radio"
  | "rating"
  | "checkbox"
  | "heading"
  | "signature"
  | "file_upload"
  | "address";

/** A choice for select / radio / multi_select fields. */
export type FieldOption = {
  value: string;
  label: string;
  /** Optional right-aligned secondary text (e.g. a per-record due date). Only the
   *  custom single_select dropdown renders it; native selects ignore it. */
  hint?: string;
};

/** Optional per-field validation constraints. */
export type FieldValidation = {
  /** number: minimum value. */
  min?: number;
  /** number: maximum value. */
  max?: number;
  /** text: minimum length. */
  minLength?: number;
  /** text: maximum length. */
  maxLength?: number;
  /** text: regex the value must match (as a string, compiled at validate time). */
  pattern?: string;
};

/**
 * Conditional visibility: the field is shown only when the referenced field's
 * answer is one of `in`. A hidden field is never required and its answer is
 * dropped on submit, so conditional logic can never trap a user behind a
 * required question they cannot see.
 */
export type VisibleWhen = { field: string; in: string[] };

export type FormField = {
  /** Stable, unique-within-schema key. Answers are keyed by this. */
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  /** Small helper text shown under the control. */
  help?: string;
  placeholder?: string;
  /** For single_select, multi_select and radio. */
  options?: FieldOption[];
  validation?: FieldValidation;
  visibleWhen?: VisibleWhen;
};

export type FormSection = {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
};

export type FormSchema = {
  schemaVersion: number;
  sections: FormSection[];
};

/** A single answer value. Multi_select is a string[]; checkbox is a boolean. */
/** A structured postal address answer (the `address` field type). */
export type AddressValue = {
  line1?: string;
  line2?: string;
  city?: string;
  county?: string;
  postcode?: string;
};

/** The ordered parts of an address, with display labels. */
export const ADDRESS_PARTS: ReadonlyArray<{ key: keyof AddressValue; label: string }> = [
  { key: "line1", label: "Address line 1" },
  { key: "line2", label: "Address line 2" },
  { key: "city", label: "Town or city" },
  { key: "county", label: "County" },
  { key: "postcode", label: "Postcode" },
];

export type AnswerValue = string | number | boolean | string[] | AddressValue | null;

/** All answers for a form, keyed by field key. */
export type Answers = Record<string, AnswerValue>;

/** Narrow an answer to a structured address value (object, not array). */
export function isAddressValue(v: AnswerValue | undefined): v is AddressValue {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** True when an address has no parts filled in. */
export function addressIsEmpty(v: AddressValue): boolean {
  return ADDRESS_PARTS.every(({ key }) => String(v[key] ?? "").trim() === "");
}

/** A one line, comma separated rendering of an address (no dashes). */
export function formatAddress(v: AddressValue): string {
  return ADDRESS_PARTS.map(({ key }) => String(v[key] ?? "").trim())
    .filter((part) => part !== "")
    .join(", ");
}

/** Field types that do not collect an answer (purely presentational). */
export function isPresentational(type: FieldType): boolean {
  return type === "heading";
}

/** Field types whose answer is a set of option values. */
export function isMultiValue(type: FieldType): boolean {
  return type === "multi_select";
}

/** Field types that carry an `options` list. */
export function fieldTakesOptions(type: FieldType): boolean {
  return type === "single_select" || type === "multi_select" || type === "radio";
}

/** Field types whose answer is an uploaded binary (file or signature image). */
export function isBinaryField(type: FieldType): boolean {
  return type === "file_upload" || type === "signature";
}

/** Flatten every field across all sections, in document order. */
export function flattenFields(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((s) => s.fields);
}

/** Look up a field by key, or undefined. */
export function findField(schema: FormSchema, key: string): FormField | undefined {
  return flattenFields(schema).find((f) => f.key === key);
}

/**
 * The key of the first date field in the schema, or null. Treated as the form's
 * "activity date" (when the thing actually happened, e.g. Date of supervision /
 * assessment / training), used to stamp the completion date instead of submit time.
 */
export function firstDateFieldKey(schema: FormSchema): string | null {
  return flattenFields(schema).find((f) => f.type === "date")?.key ?? null;
}

/** Return a copy of the schema with the field of the given key removed from every
 *  section. Used to hide a field that is being supplied another way (e.g. the
 *  supervision number, set by which Complete button was clicked). */
export function removeField(schema: FormSchema, key: string): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.key !== key),
    })),
  };
}

/**
 * Narrow an unknown value (e.g. jsonb from the database) to a FormSchema.
 * Cheap structural guard: enough to fail fast on a malformed schema before the
 * renderer or validator touch it.
 */
export function isFormSchema(value: unknown): value is FormSchema {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.sections)) return false;
  return v.sections.every((s) => {
    if (!s || typeof s !== "object") return false;
    const sec = s as Record<string, unknown>;
    return typeof sec.title === "string" && Array.isArray(sec.fields);
  });
}

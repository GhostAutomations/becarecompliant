/**
 * Be Care Compliant — Form builder (Phase 5) shared types.
 *
 * The builder AUTHORS the exact FormSchema shape that the Phase 2 engine already
 * renders (components/forms/form-renderer.tsx), validates (lib/form-validate.ts)
 * and stores as immutable Evidence. Nothing here re-describes a form: it imports
 * the canonical types from lib/form-schema.ts.
 *
 * Isomorphic and side-effect free: safe to import from client and server.
 */

import type { FieldOption, FieldType } from "@/lib/form-schema";

export type Population = "people" | "service_users";

/** A reusable question from the founder-curated question bank, shaped for the builder. */
export type BankQuestion = {
  id: string;
  label: string;
  fieldType: FieldType;
  options: FieldOption[] | null;
  helpText: string | null;
  category: string | null;
  population: "any" | Population;
};

/** A row in the Founder question-bank list. */
export type BankQuestionRow = BankQuestion & {
  active: boolean;
  sortOrder: number;
};

/** One row in the /settings/forms list. */
export type FormSummary = {
  id: string;
  key: string;
  name: string;
  population: Population;
  /** Published version currently in use, or null if never published. */
  currentVersion: number | null;
  /** True when an unpublished draft is parked alongside the published version. */
  hasDraft: boolean;
  /** Source master template key, or null for an authored/duplicated form. */
  sourceTemplateKey: string | null;
  status: "active" | "archived";
};

/** A form_versions row for the version-history panel. */
export type FormVersionRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
};

/** The master form_templates row for the Founder library list. */
export type TemplateSummary = {
  id: string;
  key: string;
  name: string;
  population: Population;
  version: number;
  status: "active" | "archived";
};

/**
 * The palette of field types the builder offers, in the order shown. Labels are
 * customer facing: no dashes, our vocabulary only (never "item"/"board").
 */
export const FIELD_TYPE_META: ReadonlyArray<{
  type: FieldType;
  label: string;
  /** Whether this type collects an answer (heading does not). */
  hint: string;
}> = [
  { type: "short_text", label: "Short text", hint: "A single line of text" },
  { type: "long_text", label: "Long text", hint: "A multi line answer" },
  { type: "number", label: "Number", hint: "A numeric value" },
  { type: "date", label: "Date", hint: "A calendar date" },
  { type: "time", label: "Time", hint: "A time of day" },
  { type: "email", label: "Email", hint: "An email address" },
  { type: "phone", label: "Phone", hint: "A phone number" },
  { type: "address", label: "Address", hint: "A postal address" },
  { type: "yes_no", label: "Yes or No", hint: "A single Yes or No answer" },
  { type: "single_select", label: "Dropdown", hint: "Pick one from a list" },
  { type: "multi_select", label: "Multi select", hint: "Pick several from a list" },
  { type: "radio", label: "Radio", hint: "Pick one, all options shown" },
  { type: "rating", label: "Rating", hint: "A star rating" },
  { type: "checkbox", label: "Checkbox", hint: "A single yes or no tick" },
  { type: "heading", label: "Section heading", hint: "A label, collects no answer" },
  { type: "signature", label: "Signature", hint: "A drawn signature" },
  { type: "file_upload", label: "File upload", hint: "Attach a file as evidence" },
];

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_META.find((m) => m.type === type)?.label ?? type;
}

/** DOM anchor id for a field (used by the content outline to scroll to it). */
export function fieldAnchorId(sectionId: string, key: string): string {
  return `bld-${sectionId}-${key}`;
}

/** DOM anchor id for a section. */
export function sectionAnchorId(sectionId: string): string {
  return `bld-section-${sectionId}`;
}

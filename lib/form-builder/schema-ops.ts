/**
 * Be Care Compliant — Form builder (Phase 5) schema operations.
 *
 * Pure, immutable helpers that transform a FormSchema for the builder UI, plus a
 * builder-time validator (distinct from lib/form-validate.ts, which validates a
 * completer's ANSWERS; this validates the SCHEMA an author is writing). No side
 * effects, no server imports: safe on the client.
 */

import {
  type FieldOption,
  type FieldType,
  type FormField,
  type FormSchema,
  type FormSection,
  fieldTakesOptions,
} from "@/lib/form-schema";

let seedCounter = 0;
/** A short random id for new sections. Stable enough within one editing session. */
function rid(prefix: string): string {
  seedCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${seedCounter}`;
}

/** A brand-new empty schema (one empty section). */
export function blankSchema(): FormSchema {
  return {
    schemaVersion: 1,
    sections: [{ id: rid("section"), title: "Section 1", fields: [] }],
  };
}

/** All field keys across every section, in document order. */
export function allKeys(schema: FormSchema): string[] {
  return schema.sections.flatMap((s) => s.fields.map((f) => f.key));
}

/** A unique field key derived from a label (or a fallback), never colliding. */
export function uniqueKey(schema: FormSchema, base: string): string {
  const slugBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  const existing = new Set(allKeys(schema));
  if (!existing.has(slugBase)) return slugBase;
  let n = 2;
  while (existing.has(`${slugBase}_${n}`)) n += 1;
  return `${slugBase}_${n}`;
}

// ---------------------------------------------------------------------------
// Section operations
// ---------------------------------------------------------------------------

export function addSection(schema: FormSchema): FormSchema {
  const n = schema.sections.length + 1;
  return {
    ...schema,
    sections: [...schema.sections, { id: rid("section"), title: `Section ${n}`, fields: [] }],
  };
}

export function removeSection(schema: FormSchema, sectionId: string): FormSchema {
  return { ...schema, sections: schema.sections.filter((s) => s.id !== sectionId) };
}

export function updateSection(
  schema: FormSchema,
  sectionId: string,
  patch: Partial<Pick<FormSection, "title" | "description">>,
): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
  };
}

export function moveSection(schema: FormSchema, sectionId: string, dir: -1 | 1): FormSchema {
  const idx = schema.sections.findIndex((s) => s.id === sectionId);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= schema.sections.length) return schema;
  const sections = [...schema.sections];
  [sections[idx], sections[to]] = [sections[to], sections[idx]];
  return { ...schema, sections };
}

// ---------------------------------------------------------------------------
// Field operations
// ---------------------------------------------------------------------------

/** A sensible default new field of a given type. */
function newField(schema: FormSchema, type: FieldType): FormField {
  const label = "Untitled question";
  const field: FormField = { key: uniqueKey(schema, label), type, label };
  if (fieldTakesOptions(type)) {
    field.options = [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ];
  }
  if (type === "rating") field.validation = { max: 5 };
  if (type === "heading") field.label = "Heading";
  return field;
}

export function addField(schema: FormSchema, sectionId: string, type: FieldType): FormSchema {
  const field = newField(schema, type);
  return {
    ...schema,
    sections: schema.sections.map((s) =>
      s.id === sectionId ? { ...s, fields: [...s.fields, field] } : s,
    ),
  };
}

/** Insert a new field of a type at a specific index within a section. */
export function insertField(
  schema: FormSchema,
  sectionId: string,
  index: number,
  type: FieldType,
): FormSchema {
  const field = newField(schema, type);
  return {
    ...schema,
    sections: schema.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      const at = Math.max(0, Math.min(index, fields.length));
      fields.splice(at, 0, field);
      return { ...s, fields };
    }),
  };
}

/** Insert a field built from a question-bank entry at a position in a section. */
export function insertFieldFromBank(
  schema: FormSchema,
  sectionId: string,
  index: number,
  bank: { label: string; fieldType: FieldType; options: FieldOption[] | null; helpText: string | null },
): FormSchema {
  const field: FormField = {
    key: uniqueKey(schema, bank.label),
    type: bank.fieldType,
    label: bank.label,
  };
  if (bank.helpText) field.help = bank.helpText;
  if (fieldTakesOptions(bank.fieldType) && bank.options && bank.options.length > 0) {
    field.options = bank.options;
  }
  if (bank.fieldType === "rating") field.validation = { max: 5 };
  return {
    ...schema,
    sections: schema.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      const at = Math.max(0, Math.min(index, fields.length));
      fields.splice(at, 0, field);
      return { ...s, fields };
    }),
  };
}

/** Move a field within its section from one index to another (drag reorder). */
export function reorderFieldInSection(
  schema: FormSchema,
  sectionId: string,
  fromIndex: number,
  toIndex: number,
): FormSchema {
  if (fromIndex === toIndex) return schema;
  return {
    ...schema,
    sections: schema.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      if (fromIndex < 0 || fromIndex >= fields.length) return s;
      const [moved] = fields.splice(fromIndex, 1);
      const at = Math.max(0, Math.min(toIndex, fields.length));
      fields.splice(at, 0, moved);
      return { ...s, fields };
    }),
  };
}

/** Move a section from one index to another (drag reorder). */
export function reorderSection(schema: FormSchema, fromIndex: number, toIndex: number): FormSchema {
  if (fromIndex === toIndex) return schema;
  const sections = [...schema.sections];
  if (fromIndex < 0 || fromIndex >= sections.length) return schema;
  const [moved] = sections.splice(fromIndex, 1);
  const at = Math.max(0, Math.min(toIndex, sections.length));
  sections.splice(at, 0, moved);
  return { ...schema, sections };
}

export function removeField(schema: FormSchema, sectionId: string, key: string): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) =>
      s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.key !== key) } : s,
    ),
  };
}

/** Patch a field. When the type loses/gains options we tidy the shape. */
export function updateField(
  schema: FormSchema,
  sectionId: string,
  key: string,
  patch: Partial<FormField>,
): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        fields: s.fields.map((f) => {
          if (f.key !== key) return f;
          const next: FormField = { ...f, ...patch };
          // Keep options consistent with the (possibly new) type.
          if (patch.type !== undefined) {
            if (fieldTakesOptions(patch.type)) {
              if (!next.options || next.options.length === 0) {
                next.options = [
                  { value: "option_1", label: "Option 1" },
                  { value: "option_2", label: "Option 2" },
                ];
              }
            } else {
              delete next.options;
            }
            // Presentational + binary fields never carry required/validation.
            if (patch.type === "heading") {
              delete next.required;
              delete next.validation;
              delete next.placeholder;
            }
          }
          return next;
        }),
      };
    }),
  };
}

export function moveField(schema: FormSchema, sectionId: string, key: string, dir: -1 | 1): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const idx = s.fields.findIndex((f) => f.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= s.fields.length) return s;
      const fields = [...s.fields];
      [fields[idx], fields[to]] = [fields[to], fields[idx]];
      return { ...s, fields };
    }),
  };
}

// ---------------------------------------------------------------------------
// Builder-time schema validation (what an author is allowed to publish).
// ---------------------------------------------------------------------------

export type SchemaIssue = { level: "error" | "warning"; message: string };

/**
 * Validate the schema an author is building. Errors block Publish; warnings are
 * shown but do not block. This protects the completer-facing contract: unique
 * keys, non-empty labels, options on choice fields, valid conditional references.
 */
export function validateSchema(schema: FormSchema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const keys = allKeys(schema);
  const answerKeys = new Set<string>();

  if (schema.sections.length === 0) {
    issues.push({ level: "error", message: "Add at least one section." });
  }

  // Duplicate keys.
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) {
      issues.push({ level: "error", message: `Duplicate field key "${k}". Keys must be unique.` });
    }
    seen.add(k);
  }

  let answerFieldCount = 0;
  for (const section of schema.sections) {
    if (section.title.trim() === "") {
      issues.push({ level: "error", message: "Every section needs a title." });
    }
    for (const field of section.fields) {
      if (field.type !== "heading") {
        answerFieldCount += 1;
        answerKeys.add(field.key);
      }
      if (field.label.trim() === "") {
        issues.push({ level: "error", message: `A ${field.type} field is missing its label.` });
      }
      if (!/^[a-z][a-z0-9_]*$/.test(field.key)) {
        issues.push({
          level: "error",
          message: `Field key "${field.key}" must start with a letter and use only lowercase letters, numbers and underscores.`,
        });
      }
      if (fieldTakesOptions(field.type)) {
        const opts = field.options ?? [];
        if (opts.length < 2) {
          issues.push({
            level: "error",
            message: `"${field.label || field.key}" needs at least two options.`,
          });
        }
        const values = new Set<string>();
        for (const o of opts) {
          if (o.value.trim() === "" || o.label.trim() === "") {
            issues.push({
              level: "error",
              message: `"${field.label || field.key}" has an option with an empty value or label.`,
            });
          }
          if (values.has(o.value)) {
            issues.push({
              level: "error",
              message: `"${field.label || field.key}" has duplicate option values.`,
            });
          }
          values.add(o.value);
        }
      }
      if (field.validation) {
        const v = field.validation;
        if (v.min != null && v.max != null && v.min > v.max) {
          issues.push({ level: "error", message: `"${field.label}" has min greater than max.` });
        }
        if (v.minLength != null && v.maxLength != null && v.minLength > v.maxLength) {
          issues.push({
            level: "error",
            message: `"${field.label}" has a minimum length greater than its maximum.`,
          });
        }
        if (v.pattern) {
          try {
            new RegExp(v.pattern);
          } catch {
            issues.push({ level: "error", message: `"${field.label}" has an invalid pattern.` });
          }
        }
      }
      if (field.visibleWhen) {
        const ref = field.visibleWhen.field;
        if (!answerKeys.has(ref) && !keys.includes(ref)) {
          issues.push({
            level: "error",
            message: `"${field.label}" depends on "${ref}", which does not exist.`,
          });
        }
        if (ref === field.key) {
          issues.push({ level: "error", message: `"${field.label}" cannot depend on itself.` });
        }
        if ((field.visibleWhen.in ?? []).length === 0) {
          issues.push({
            level: "warning",
            message: `"${field.label}" has a condition with no values chosen, so it will never show.`,
          });
        }
      }
    }
  }

  if (answerFieldCount === 0) {
    issues.push({
      level: "warning",
      message: "This form has no answerable fields yet. Add a question before publishing.",
    });
  }

  return issues;
}

export function hasBlockingErrors(issues: SchemaIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

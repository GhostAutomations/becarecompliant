"use client";

/**
 * Be Care Compliant — Form builder: a single field editor card.
 *
 * Authors the canonical FormField shape (lib/form-schema.ts). Every control is a
 * bare input/select/textarea styled centrally in globals.css @layer base: nothing
 * here styles a control inline (no border-*, no bg-* on inputs). Vocabulary stays
 * Form / Check / Record: never "item"/"board".
 */

import { useId } from "react";
import {
  type FieldOption,
  type FieldType,
  type FormField,
  fieldTakesOptions,
} from "@/lib/form-schema";
import { FIELD_TYPE_META, fieldTypeLabel } from "@/lib/form-builder/types";

type Props = {
  field: FormField;
  /** All fields in the whole form (for the conditional-logic picker). */
  allFields: FormField[];
  index: number;
  count: number;
  onChange: (patch: Partial<FormField>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  /** Optional drag handle rendered in the header (drag reorder). */
  dragHandle?: React.ReactNode;
};

const TEXT_TYPES: FieldType[] = ["short_text", "long_text"];

export default function FieldEditor({
  field,
  allFields,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  dragHandle,
}: Props) {
  const uid = useId();
  const isHeading = field.type === "heading";
  const isChoice = fieldTakesOptions(field.type);
  const isText = TEXT_TYPES.includes(field.type);
  const isNumber = field.type === "number";

  // Fields that can drive a conditional (discrete answers), excluding this one.
  const conditionSources = allFields.filter(
    (f) =>
      f.key !== field.key &&
      (fieldTakesOptions(f.type) || f.type === "checkbox" || f.type === "yes_no"),
  );

  function setOptions(options: FieldOption[]) {
    onChange({ options });
  }

  function updateOption(i: number, patch: Partial<FieldOption>) {
    const options = [...(field.options ?? [])];
    options[i] = { ...options[i], ...patch };
    setOptions(options);
  }

  function addOption() {
    const options = [...(field.options ?? [])];
    const n = options.length + 1;
    setOptions([...options, { value: `option_${n}`, label: `Option ${n}` }]);
  }

  function removeOption(i: number) {
    setOptions((field.options ?? []).filter((_, idx) => idx !== i));
  }

  const conditionField = field.visibleWhen
    ? allFields.find((f) => f.key === field.visibleWhen!.field)
    : undefined;
  const conditionValues: FieldOption[] = conditionField
    ? conditionField.type === "checkbox"
      ? [
          { value: "true", label: "Ticked" },
          { value: "false", label: "Not ticked" },
        ]
      : conditionField.type === "yes_no"
        ? [
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]
        : conditionField.options ?? []
    : [];

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {dragHandle}
          <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {field.label || "Untitled question"}
          </p>
          <p className="text-[11px] text-white/45">{fieldTypeLabel(field.type)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="btn-ghost px-2 py-1 text-xs"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="btn-ghost px-2 py-1 text-xs"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="btn-ghost px-2 py-1 text-xs text-red-300"
            aria-label="Remove field"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-type`} className="form-label">
            Field type
          </label>
          <select
            id={`${uid}-type`}
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as FieldType })}
          >
            {FIELD_TYPE_META.map((m) => (
              <option key={m.type} value={m.type}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-label`} className="form-label">
            {isHeading ? "Heading text" : "Question label"}
          </label>
          <input
            id={`${uid}-label`}
            type="text"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
      </div>

      {!isHeading && (
        <div className="mt-3">
          <label htmlFor={`${uid}-help`} className="form-label">
            Help text
          </label>
          <input
            id={`${uid}-help`}
            type="text"
            value={field.help ?? ""}
            onChange={(e) => onChange({ help: e.target.value || undefined })}
            placeholder="Optional guidance shown under the field"
          />
        </div>
      )}

      {(isText || isNumber || field.type === "email" || field.type === "phone") && (
        <div className="mt-3">
          <label htmlFor={`${uid}-ph`} className="form-label">
            Placeholder
          </label>
          <input
            id={`${uid}-ph`}
            type="text"
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
          />
        </div>
      )}

      {field.type === "rating" && (
        <div className="mt-3">
          <label htmlFor={`${uid}-stars`} className="form-label">
            Maximum stars
          </label>
          <input
            id={`${uid}-stars`}
            type="number"
            min={2}
            max={10}
            value={field.validation?.max ?? 5}
            onChange={(e) =>
              onChange({
                validation: cleanVal({ ...field.validation, max: Number(e.target.value) || 5 }),
              })
            }
          />
        </div>
      )}

      {/* Options editor for choice fields */}
      {isChoice && (
        <div className="mt-4">
          <p className="form-label">Options</p>
          <div className="space-y-2">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(i, { label: e.target.value })}
                  placeholder="Label shown to the user"
                  aria-label={`Option ${i + 1} label`}
                />
                <input
                  type="text"
                  value={opt.value}
                  onChange={(e) => updateOption(i, { value: e.target.value })}
                  placeholder="Stored value"
                  aria-label={`Option ${i + 1} value`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="btn-ghost px-2 py-1 text-xs text-red-300"
                  aria-label={`Remove option ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addOption} className="btn-outline mt-2 px-3 py-1.5 text-xs">
            Add option
          </button>
        </div>
      )}

      {/* Validation */}
      {(isNumber || isText) && (
        <div className="mt-4">
          <p className="form-label">Validation</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {isNumber && (
              <>
                <NumberBox
                  label="Minimum value"
                  value={field.validation?.min}
                  onChange={(min) => onChange({ validation: cleanVal({ ...field.validation, min }) })}
                />
                <NumberBox
                  label="Maximum value"
                  value={field.validation?.max}
                  onChange={(max) => onChange({ validation: cleanVal({ ...field.validation, max }) })}
                />
              </>
            )}
            {isText && (
              <>
                <NumberBox
                  label="Minimum length"
                  value={field.validation?.minLength}
                  onChange={(minLength) =>
                    onChange({ validation: cleanVal({ ...field.validation, minLength }) })
                  }
                />
                <NumberBox
                  label="Maximum length"
                  value={field.validation?.maxLength}
                  onChange={(maxLength) =>
                    onChange({ validation: cleanVal({ ...field.validation, maxLength }) })
                  }
                />
                <div className="sm:col-span-2">
                  <label htmlFor={`${uid}-pat`} className="form-label">
                    Pattern (regular expression)
                  </label>
                  <input
                    id={`${uid}-pat`}
                    type="text"
                    value={field.validation?.pattern ?? ""}
                    onChange={(e) =>
                      onChange({
                        validation: cleanVal({
                          ...field.validation,
                          pattern: e.target.value || undefined,
                        }),
                      })
                    }
                    placeholder="e.g. ^[A-Z]{2}[0-9]{6}$"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Conditional logic */}
      {!isHeading && conditionSources.length > 0 && (
        <div className="mt-4">
          <p className="form-label">Show this field only when</p>
          {!field.visibleWhen ? (
            <button
              type="button"
              onClick={() =>
                onChange({ visibleWhen: { field: conditionSources[0].key, in: [] } })
              }
              className="btn-outline px-3 py-1.5 text-xs"
            >
              Add a condition
            </button>
          ) : (
            <div className="space-y-2">
              <select
                value={field.visibleWhen.field}
                onChange={(e) => onChange({ visibleWhen: { field: e.target.value, in: [] } })}
                aria-label="Condition field"
              >
                {conditionSources.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label || f.key}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3 rounded-xl bg-white/5 p-3">
                {conditionValues.length === 0 ? (
                  <p className="text-xs text-white/50">
                    The chosen field has no options to match on.
                  </p>
                ) : (
                  conditionValues.map((v) => {
                    const checked = field.visibleWhen!.in.includes(v.value);
                    return (
                      <label key={v.value} className="flex items-center gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const cur = field.visibleWhen!;
                            const set = new Set(cur.in);
                            if (e.target.checked) set.add(v.value);
                            else set.delete(v.value);
                            onChange({ visibleWhen: { field: cur.field, in: Array.from(set) } });
                          }}
                        />
                        {v.label}
                      </label>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange({ visibleWhen: undefined })}
                className="btn-ghost px-2 py-1 text-xs text-white/60"
              >
                Remove condition
              </button>
            </div>
          )}
        </div>
      )}

      {!isHeading && (
        <div className="mt-4 flex justify-end">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            Required
          </label>
        </div>
      )}
    </div>
  );
}

/** Strip empty keys so validation objects never carry stray undefined-only shells. */
function cleanVal(v: Record<string, unknown>): FormField["validation"] {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined && val !== null && val !== "") out[k] = val;
  }
  return Object.keys(out).length ? (out as FormField["validation"]) : undefined;
}

function NumberBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const uid = useId();
  return (
    <div>
      <label htmlFor={uid} className="form-label">
        {label}
      </label>
      <input
        id={uid}
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </div>
  );
}

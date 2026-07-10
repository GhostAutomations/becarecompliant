"use client";

/**
 * Be Care Compliant — Form builder: one section card holding its fields.
 * Controls are canonical (styled in globals.css); layout only is inline.
 */

import { useId } from "react";
import { type FieldType, type FormField, type FormSection } from "@/lib/form-schema";
import { FIELD_TYPE_META } from "@/lib/form-builder/types";
import FieldEditor from "./field-editor";

type Props = {
  section: FormSection;
  allFields: FormField[];
  index: number;
  count: number;
  onChangeSection: (patch: Partial<Pick<FormSection, "title" | "description">>) => void;
  onMoveSection: (dir: -1 | 1) => void;
  onRemoveSection: () => void;
  onAddField: (type: FieldType) => void;
  onChangeField: (key: string, patch: Partial<FormField>) => void;
  onMoveField: (key: string, dir: -1 | 1) => void;
  onRemoveField: (key: string) => void;
};

export default function SectionEditor({
  section,
  allFields,
  index,
  count,
  onChangeSection,
  onMoveSection,
  onRemoveSection,
  onAddField,
  onChangeField,
  onMoveField,
  onRemoveField,
}: Props) {
  const uid = useId();

  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
          Section {index + 1}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveSection(-1)}
            disabled={index === 0}
            className="btn-ghost px-2 py-1 text-xs"
            aria-label="Move section up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMoveSection(1)}
            disabled={index === count - 1}
            className="btn-ghost px-2 py-1 text-xs"
            aria-label="Move section down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemoveSection}
            className="btn-ghost px-2 py-1 text-xs text-red-300"
          >
            Remove section
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-title`} className="form-label">
            Section title
          </label>
          <input
            id={`${uid}-title`}
            type="text"
            value={section.title}
            onChange={(e) => onChangeSection({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-desc`} className="form-label">
            Description
          </label>
          <input
            id={`${uid}-desc`}
            type="text"
            value={section.description ?? ""}
            onChange={(e) => onChangeSection({ description: e.target.value || undefined })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {section.fields.length === 0 ? (
          <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/50">
            No fields yet. Add one below.
          </p>
        ) : (
          section.fields.map((field, i) => (
            <FieldEditor
              key={i}
              field={field}
              allFields={allFields}
              index={i}
              count={section.fields.length}
              onChange={(patch) => onChangeField(field.key, patch)}
              onMove={(dir) => onMoveField(field.key, dir)}
              onRemove={() => onRemoveField(field.key)}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor={`${uid}-add`} className="text-xs text-white/60">
          Add field:
        </label>
        <select
          id={`${uid}-add`}
          value=""
          onChange={(e) => {
            if (e.target.value) onAddField(e.target.value as FieldType);
            e.target.value = "";
          }}
          aria-label="Add a field of a chosen type"
        >
          <option value="" disabled>
            Choose a type…
          </option>
          {FIELD_TYPE_META.map((m) => (
            <option key={m.type} value={m.type}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

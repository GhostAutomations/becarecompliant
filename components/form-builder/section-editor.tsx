"use client";

/**
 * Be Care Compliant — Form builder: one section card holding its fields.
 * Supports drag reorder (handle only, so inputs still work), insert a field at
 * any position, and up/down arrows as an accessible fallback. Controls are
 * canonical (styled in globals.css); layout only is inline.
 */

import { useId, useState } from "react";
import { type FieldType, type FormField, type FormSection } from "@/lib/form-schema";
import { type BankQuestion, fieldAnchorId } from "@/lib/form-builder/types";
import FieldEditor from "./field-editor";
import InsertFieldMenu from "./insert-field-menu";

type Props = {
  section: FormSection;
  allFields: FormField[];
  index: number;
  count: number;
  bank?: BankQuestion[];
  dragHandle?: React.ReactNode;
  onChangeSection: (patch: Partial<Pick<FormSection, "title" | "description">>) => void;
  onMoveSection: (dir: -1 | 1) => void;
  onRemoveSection: () => void;
  onAddField: (type: FieldType) => void;
  onInsertField: (index: number, type: FieldType) => void;
  onInsertBank: (index: number, q: BankQuestion) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onChangeField: (key: string, patch: Partial<FormField>) => void;
  onMoveField: (key: string, dir: -1 | 1) => void;
  onRemoveField: (key: string) => void;
};

export default function SectionEditor({
  section,
  allFields,
  index,
  count,
  bank,
  dragHandle,
  onChangeSection,
  onMoveSection,
  onRemoveSection,
  onAddField,
  onInsertField,
  onInsertBank,
  onReorderFields,
  onChangeField,
  onMoveField,
  onRemoveField,
}: Props) {
  const uid = useId();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <div id={`bld-section-${section.id}`} className="glass-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {dragHandle}
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Section {index + 1}
          </p>
        </div>
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

      <div className="mt-4">
        {section.fields.length === 0 ? (
          <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/50">
            No fields yet. Add one below.
          </p>
        ) : (
          section.fields.map((field, i) => (
            <div key={i}>
              <InsertFieldMenu
                onPickType={(type) => onInsertField(i, type)}
                onPickBank={(q) => onInsertBank(i, q)}
                bank={bank}
              />
              <div
                id={fieldAnchorId(section.id, field.key)}
                onDragOver={(e) => {
                  if (dragFrom != null) {
                    e.preventDefault();
                    setDragOver(i);
                  }
                }}
                onDrop={() => {
                  if (dragFrom != null) onReorderFields(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={dragOver === i && dragFrom != null ? "rounded-2xl ring-2 ring-gold-400/50" : ""}
              >
                <FieldEditor
                  field={field}
                  allFields={allFields}
                  index={i}
                  count={section.fields.length}
                  onChange={(patch) => onChangeField(field.key, patch)}
                  onMove={(dir) => onMoveField(field.key, dir)}
                  onRemove={() => onRemoveField(field.key)}
                  dragHandle={
                    <span
                      draggable
                      onDragStart={() => setDragFrom(i)}
                      onDragEnd={() => {
                        setDragFrom(null);
                        setDragOver(null);
                      }}
                      className="cursor-grab select-none px-1 text-white/40"
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <InsertFieldMenu
          onPickType={onAddField}
          onPickBank={(q) => onInsertBank(section.fields.length, q)}
          bank={bank}
          variant="button"
          label="Add field"
        />
      </div>
    </div>
  );
}

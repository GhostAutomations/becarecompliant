"use client";

/**
 * Be Care Compliant — the shared, schema-driven Form renderer (Phase 2).
 *
 * The ONE component every later phase uses to render and complete a Form. It
 * reads a FormSchema, renders each field with the CANONICAL controls from
 * globals.css (never styled inline), applies conditional logic live, and reports
 * answers + validity to its parent. There is no authoring UI here (that is
 * Phase 5); this only renders and validates an existing schema.
 *
 * Binary fields:
 *  - file_upload stores the chosen file's name in the answer and hands the File
 *    to onFileSelect for the submit pipeline to upload.
 *  - signature captures a drawn signature as a data URL in the answer.
 *
 * Validation display is driven by the shared validator (lib/form-validate.ts):
 * pass `errors` after a submit attempt and they render under the right fields.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  type Answers,
  type AnswerValue,
  type FormField,
  type FormSchema,
} from "@/lib/form-schema";
import { type FieldError, isFieldVisible } from "@/lib/form-validate";

type Props = {
  schema: FormSchema;
  /** Initial answers (uncontrolled). */
  defaultValue?: Answers;
  /** Validation errors to display (from the shared validator, post submit). */
  errors?: FieldError[];
  disabled?: boolean;
  /** Prefix for input ids so multiple renderers on a page never collide. */
  idPrefix?: string;
  /** Called with the full answers object whenever any field changes. */
  onChange?: (answers: Answers) => void;
  /** Called when a file_upload / signature binary is chosen or cleared. */
  onFileSelect?: (key: string, file: File | null) => void;
};

// React 19 note: useCallback is imported individually above to match the repo's
// existing import style; behaviour is identical to React.useCallback.
export default function FormRenderer({
  schema,
  defaultValue,
  errors,
  disabled = false,
  idPrefix = "f",
  onChange,
  onFileSelect,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(defaultValue ?? {});

  const errorMap = useMemo(() => {
    const m = new Map<string, string>();
    (errors ?? []).forEach((e) => m.set(e.key, e.message));
    return m;
  }, [errors]);

  const update = useCallback(
    (key: string, value: AnswerValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [key]: value };
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-6">
      {schema.sections.map((section) => (
        <section key={section.id} className="section-card p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">{section.title}</h3>
            {section.description ? (
              <p className="page-subtitle mt-1">{section.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-5">
            {section.fields.map((field) =>
              isFieldVisible(field, answers) ? (
                <Field
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  error={errorMap.get(field.key)}
                  disabled={disabled}
                  idPrefix={idPrefix}
                  onValue={(v) => update(field.key, v)}
                  onFileSelect={onFileSelect}
                />
              ) : null,
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function RequiredMark({ required }: { required?: boolean }) {
  if (!required) return null;
  return (
    <span className="ml-1 text-gold-300" aria-hidden="true">
      *
    </span>
  );
}

function Field({
  field,
  value,
  error,
  disabled,
  idPrefix,
  onValue,
  onFileSelect,
}: {
  field: FormField;
  value: AnswerValue | undefined;
  error?: string;
  disabled: boolean;
  idPrefix: string;
  onValue: (v: AnswerValue) => void;
  onFileSelect?: (key: string, file: File | null) => void;
}) {
  const id = `${idPrefix}-${field.key}`;

  // Presentational heading: a sub-heading inside a section.
  if (field.type === "heading") {
    return (
      <h4 className="border-b border-white/10 pb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
        {field.label}
      </h4>
    );
  }

  const labelledControl = (control: React.ReactNode) => (
    <div>
      <label htmlFor={id} className="form-label">
        {field.label}
        <RequiredMark required={field.required} />
      </label>
      {control}
      {field.help ? <p className="form-hint">{field.help}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );

  switch (field.type) {
    case "short_text":
      return labelledControl(
        <input
          id={id}
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "long_text":
      return labelledControl(
        <textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "number":
      return labelledControl(
        <input
          id={id}
          type="number"
          value={value == null || value === "" ? "" : String(value)}
          placeholder={field.placeholder}
          min={field.validation?.min}
          max={field.validation?.max}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value === "" ? "" : Number(e.target.value))}
        />,
      );

    case "date":
      return labelledControl(
        <input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "single_select":
      return labelledControl(
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        >
          <option value="">Please choose</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>,
      );

    case "radio":
      return labelledControl(
        <div className="mt-1 flex flex-col gap-2">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 text-sm text-white/90">
              <input
                type="radio"
                name={id}
                value={o.value}
                checked={value === o.value}
                disabled={disabled}
                onChange={() => onValue(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>,
      );

    case "multi_select": {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (v: string) =>
        onValue(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return labelledControl(
        <div className="mt-1 flex flex-col gap-2">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 text-sm text-white/90">
              <input
                type="checkbox"
                value={o.value}
                checked={selected.includes(o.value)}
                disabled={disabled}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>,
      );
    }

    case "checkbox":
      return (
        <div>
          <label htmlFor={id} className="flex items-center gap-2.5 text-sm text-white/90">
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              disabled={disabled}
              onChange={(e) => onValue(e.target.checked)}
            />
            <span>
              {field.label}
              <RequiredMark required={field.required} />
            </span>
          </label>
          {field.help ? <p className="form-hint">{field.help}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      );

    case "file_upload":
      return labelledControl(
        <FileField
          id={id}
          fileName={typeof value === "string" ? value : ""}
          disabled={disabled}
          onFile={(file) => {
            onValue(file ? file.name : "");
            onFileSelect?.(field.key, file);
          }}
        />,
      );

    case "signature":
      return labelledControl(
        <SignaturePad
          dataUrl={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(dataUrl) => onValue(dataUrl)}
        />,
      );

    default:
      return null;
  }
}

/** Styled file picker (file inputs are intentionally not styled in globals.css). */
function FileField({
  id,
  fileName,
  disabled,
  onFile,
}: {
  id: string;
  fileName: string;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={ref}
        id={id}
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className="btn-outline"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        Choose file
      </button>
      <span className="text-sm text-white/60">{fileName || "No file chosen"}</span>
    </div>
  );
}

/** Lightweight signature pad: draws to a canvas and reports a PNG data URL. */
function SignaturePad({
  dataUrl,
  disabled,
  onChange,
}: {
  dataUrl: string;
  disabled: boolean;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current!;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        className="w-full touch-none rounded-xl border border-white/20 bg-white/10 backdrop-blur"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex items-center gap-3">
        <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={clear}>
          Clear signature
        </button>
        <span className="text-xs text-white/50">
          {dataUrl ? "Signature captured" : "Sign in the box above"}
        </span>
      </div>
    </div>
  );
}

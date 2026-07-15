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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ADDRESS_PARTS,
  type AddressValue,
  type Answers,
  type AnswerValue,
  type FieldOption,
  type FormField,
  type FormSchema,
  isAddressValue,
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
  // Mirror the latest answers in a ref so `update` can build the next value
  // without a state-updater. The previous version called the parent's onChange
  // *inside* the setAnswers updater, which violates React's rule that updaters
  // be pure/side-effect-free. Under a concurrent transition (a Server Action
  // redirect) on a form whose visible fields had just changed, that impurity
  // corrupted hook bookkeeping and threw "Rendered more hooks than during the
  // previous render". Both the state set and the parent notify now happen in
  // the event handler with a concrete value.
  const answersRef = useRef<Answers>(answers);

  const errorMap = useMemo(() => {
    const m = new Map<string, string>();
    (errors ?? []).forEach((e) => m.set(e.key, e.message));
    return m;
  }, [errors]);

  const update = useCallback(
    (key: string, value: AnswerValue) => {
      const next = { ...answersRef.current, [key]: value };
      answersRef.current = next;
      setAnswers(next);
      onChange?.(next);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-6">
      {schema.sections.map((section) => (
        <section key={section.id} className="section-card p-5">
          {section.title || section.description ? (
            <div className="mb-4">
              {section.title ? (
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
              ) : null}
              {section.description ? (
                <p className="page-subtitle mt-1">{section.description}</p>
              ) : null}
            </div>
          ) : null}
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

    case "time":
      return labelledControl(
        <input
          id={id}
          type="time"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "email":
      return labelledControl(
        <input
          id={id}
          type="email"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "phone":
      return labelledControl(
        <input
          id={id}
          type="tel"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        />,
      );

    case "yes_no":
      return labelledControl(
        <div className="mt-1 flex gap-2">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onValue(opt)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                value === opt ? "bg-gold-400/20 text-white" : "bg-white/5 text-white/60"
              }`}
              aria-pressed={value === opt}
            >
              {opt}
            </button>
          ))}
        </div>,
      );

    case "rating":
      return labelledControl(
        <RatingStars
          value={typeof value === "number" ? value : 0}
          max={field.validation?.max ?? 5}
          disabled={disabled}
          onValue={onValue}
        />,
      );

    case "address":
      return labelledControl(
        <AddressFields
          value={isAddressValue(value) ? value : {}}
          disabled={disabled}
          onValue={onValue}
        />,
      );

    case "single_select": {
      const opts = field.options ?? [];
      // When any option carries a right-aligned hint (e.g. per-record due dates),
      // use the custom dropdown so label sits left and hint sits right; otherwise
      // the canonical native select.
      if (opts.some((o) => o.hint)) {
        return labelledControl(
          <HintSelect
            id={id}
            value={typeof value === "string" ? value : ""}
            options={opts}
            disabled={disabled}
            onValue={onValue}
          />,
        );
      }
      return labelledControl(
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
        >
          <option value="">Please choose</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>,
      );
    }

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

/**
 * Custom single_select dropdown that shows each option's label on the left and an
 * optional hint (e.g. a per-record due date) right-aligned. Canonical styling lives
 * in globals.css (.hint-select-*). Used only when options carry hints; every other
 * select stays the native control.
 */
function HintSelect({
  id,
  value,
  options,
  disabled,
  onValue,
}: {
  id: string;
  value: string;
  options: FieldOption[];
  disabled: boolean;
  onValue: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  }

  function choose(v: string) {
    onValue(v);
    setOpen(false);
  }

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        disabled={disabled}
        className="hint-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={selected ? "text-white" : "text-white/40"}>
          {selected ? selected.label : "Please choose"}
        </span>
        {selected?.hint ? <span className="hint-select-hint ml-auto">{selected.hint}</span> : null}
        <span className={selected?.hint ? "" : "ml-auto"} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            className="hint-select-menu"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          >
            <li
              role="option"
              aria-selected={value === ""}
              className="hint-select-option text-white/60"
              onClick={() => choose("")}
            >
              Please choose
            </li>
            {options.map((o) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className="hint-select-option"
                onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.hint ? <span className="hint-select-hint">{o.hint}</span> : null}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

/** Star rating (1..max). Answer is the chosen number. */
function RatingStars({
  value,
  max,
  disabled,
  onValue,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onValue: (v: AnswerValue) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-label={`${n} of ${max}`}
          aria-pressed={value === n}
          onClick={() => onValue(value === n ? 0 : n)}
          className={`text-2xl leading-none ${n <= value ? "text-gold-300" : "text-white/25"}`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-white/60">
          {value} of {max}
        </span>
      )}
    </div>
  );
}

/** Structured postal address: several lines assembled into one AddressValue. */
function AddressFields({
  value,
  disabled,
  onValue,
}: {
  value: AddressValue;
  disabled: boolean;
  onValue: (v: AnswerValue) => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      {ADDRESS_PARTS.map(({ key, label }) => (
        <input
          key={key}
          type="text"
          aria-label={label}
          placeholder={label}
          value={value[key] ?? ""}
          disabled={disabled}
          onChange={(e) => onValue({ ...value, [key]: e.target.value })}
        />
      ))}
    </div>
  );
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

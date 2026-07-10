"use client";

/**
 * Be Care Compliant — Founder question bank curation (Phase 5).
 * A global library of reusable questions authors can drop into any form. Platform
 * admin only (RLS enforced). Canonical controls only.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type FieldType, fieldTakesOptions } from "@/lib/form-schema";
import { FIELD_TYPE_META, type BankQuestionRow } from "@/lib/form-builder/types";
import {
  createQuestionTemplate,
  setQuestionTemplateActive,
  updateQuestionTemplate,
  type BankInput,
} from "@/lib/form-builder/actions";

const BANK_TYPES = FIELD_TYPE_META.filter(
  (m) => !["heading", "signature", "file_upload"].includes(m.type),
);

const POP_LABEL: Record<string, string> = {
  any: "Any form",
  people: "People",
  service_users: "Service Users",
};

type Draft = {
  label: string;
  fieldType: FieldType;
  population: "any" | "people" | "service_users";
  category: string;
  helpText: string;
  options: { value: string; label: string }[];
};

function emptyDraft(): Draft {
  return { label: "", fieldType: "short_text", population: "any", category: "", helpText: "", options: [] };
}

function toInput(d: Draft): BankInput {
  return {
    label: d.label,
    fieldType: d.fieldType,
    population: d.population,
    category: d.category || null,
    helpText: d.helpText || null,
    options: fieldTakesOptions(d.fieldType) ? d.options : null,
  };
}

function QuestionForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: Draft;
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [pending] = useState(false);
  const showOptions = fieldTakesOptions(d.fieldType);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="form-label">Question label</label>
          <input type="text" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Field type</label>
          <select
            value={d.fieldType}
            onChange={(e) => setD({ ...d, fieldType: e.target.value as FieldType })}
          >
            {BANK_TYPES.map((m) => (
              <option key={m.type} value={m.type}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">For</label>
          <select
            value={d.population}
            onChange={(e) => setD({ ...d, population: e.target.value as Draft["population"] })}
          >
            <option value="any">Any form</option>
            <option value="people">People forms</option>
            <option value="service_users">Service User forms</option>
          </select>
        </div>
        <div>
          <label className="form-label">Category</label>
          <input
            type="text"
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
            placeholder="Optional, e.g. Wellbeing"
          />
        </div>
      </div>
      <div>
        <label className="form-label">Help text</label>
        <input type="text" value={d.helpText} onChange={(e) => setD({ ...d, helpText: e.target.value })} />
      </div>

      {showOptions && (
        <div>
          <label className="form-label">Options</label>
          <div className="space-y-2">
            {d.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={o.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const options = [...d.options];
                    options[i] = { ...options[i], label: e.target.value };
                    setD({ ...d, options });
                  }}
                />
                <input
                  type="text"
                  value={o.value}
                  placeholder="Value"
                  onChange={(e) => {
                    const options = [...d.options];
                    options[i] = { ...options[i], value: e.target.value };
                    setD({ ...d, options });
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs text-red-300"
                  onClick={() => setD({ ...d, options: d.options.filter((_, idx) => idx !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-outline mt-2 px-3 py-1.5 text-xs"
            onClick={() => {
              const n = d.options.length + 1;
              setD({ ...d, options: [...d.options, { value: `option_${n}`, label: `Option ${n}` }] });
            }}
          >
            Add option
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || d.label.trim() === ""}
          onClick={() => onSubmit(d)}
          className="btn-primary px-4 py-2 text-sm"
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-2 text-sm text-white/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function QuestionBankManager({ questions }: { questions: BankQuestionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function create(d: Draft) {
    setError(null);
    startTransition(async () => {
      const res = await createQuestionTemplate(toInput(d));
      if (res.error) setError(res.error);
      else {
        setCreating(false);
        router.refresh();
      }
    });
  }

  function save(id: string, d: Draft) {
    setError(null);
    startTransition(async () => {
      const res = await updateQuestionTemplate(id, toInput(d));
      if (res.error) setError(res.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function toggle(q: BankQuestionRow) {
    startTransition(async () => {
      const res = await setQuestionTemplateActive(q.id, !q.active);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="btn-primary px-4 py-2 text-sm">
            New question
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {creating && (
        <div className="glass-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">New question</h2>
          <QuestionForm
            initial={emptyDraft()}
            onSubmit={create}
            onCancel={() => setCreating(false)}
            submitLabel={pending ? "Adding…" : "Add question"}
          />
        </div>
      )}

      {questions.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          No questions yet. Add reusable questions authors can drop into any form.
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q) =>
            editing === q.id ? (
              <div key={q.id} className="glass-card p-5">
                <QuestionForm
                  initial={{
                    label: q.label,
                    fieldType: q.fieldType,
                    population: q.population,
                    category: q.category ?? "",
                    helpText: q.helpText ?? "",
                    options: q.options ?? [],
                  }}
                  onSubmit={(d) => save(q.id, d)}
                  onCancel={() => setEditing(null)}
                  submitLabel={pending ? "Saving…" : "Save question"}
                />
              </div>
            ) : (
              <div key={q.id} className="glass-card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{q.label}</p>
                  <p className="text-[11px] text-white/45">
                    {POP_LABEL[q.population]}
                    {q.category ? ` · ${q.category}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!q.active && <span className="pill pill-neutral">archived</span>}
                  <button
                    type="button"
                    onClick={() => setEditing(q.id)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(q)}
                    disabled={pending}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {q.active ? "Archive" : "Restore"}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

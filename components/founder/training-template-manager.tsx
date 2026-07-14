"use client";

/**
 * Be Care Compliant — founder curation of the master training course catalogue.
 * These templates seed every new company (seed_company_training_courses). Editing
 * a template does not touch companies already seeded. Canonical controls only
 * (globals.css); save-button discipline with inline error/ok.
 */

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import {
  createTrainingTemplate,
  updateTrainingTemplate,
  deleteTrainingTemplate,
} from "@/app/(app)/founder/actions";

export type TrainingTemplate = {
  id: string;
  name: string;
  renewal_months: number | null;
  mandatory: boolean;
  is_safeguarding: boolean;
  amber_days: number;
  sort_order: number;
  active: boolean;
};

function AddForm() {
  const [state, action, pending] = useActionState(createTrainingTemplate, IDLE_STATE);
  return (
    <form action={action} className="glass-card space-y-4 p-5">
      <h2 className="text-base font-semibold text-white">Add a course</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Course name</span>
          <input name="name" required placeholder="e.g. Moving and Handling" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Renewal (months)</span>
          <input name="renewal_months" type="number" min={1} placeholder="Leave blank if one off" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Amber warning (days)</span>
          <input name="amber_days" type="number" min={0} defaultValue={30} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Sort order</span>
          <input name="sort_order" type="number" defaultValue={0} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <label className="inline-flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" name="mandatory" defaultChecked />
          Mandatory
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" name="is_safeguarding" />
          Safeguarding
        </label>
        <button type="submit" disabled={pending} className="btn-primary ml-auto px-4 py-2 text-sm">
          {pending ? "Adding…" : "Add course"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
      {!state.error && state.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
    </form>
  );
}

function TemplateRow({ t }: { t: TrainingTemplate }) {
  const [saveState, saveAction, saving] = useActionState(updateTrainingTemplate, IDLE_STATE);
  const [delState, delAction, deleting] = useActionState(deleteTrainingTemplate, IDLE_STATE);
  return (
    <div className="glass-card p-5">
      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="id" value={t.id} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-white/70">Course</span>
            <input name="name" defaultValue={t.name} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-white/70">Renewal (months)</span>
            <input
              name="renewal_months"
              type="number"
              min={1}
              defaultValue={t.renewal_months ?? ""}
              placeholder="One off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-white/70">Amber (days)</span>
            <input name="amber_days" type="number" min={0} defaultValue={t.amber_days} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-white/70">Sort</span>
            <input name="sort_order" type="number" defaultValue={t.sort_order} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="inline-flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="mandatory" defaultChecked={t.mandatory} />
            Mandatory
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="is_safeguarding" defaultChecked={t.is_safeguarding} />
            Safeguarding
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="active" defaultChecked={t.active} />
            Active (seeds new companies)
          </label>
          <button type="submit" disabled={saving} className="btn-ghost ml-auto px-3 py-1.5 text-xs">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {saveState.error && <p className="text-sm text-red-300">{saveState.error}</p>}
        {!saveState.error && saveState.ok && (
          <p className="text-sm text-emerald-300">{saveState.ok}</p>
        )}
      </form>
      <form action={delAction} className="mt-2 border-t border-white/10 pt-2">
        <input type="hidden" name="id" value={t.id} />
        <button type="submit" disabled={deleting} className="text-xs text-red-300 hover:underline">
          {deleting ? "Deleting…" : "Delete template"}
        </button>
        {delState.error && <span className="ml-2 text-xs text-red-300">{delState.error}</span>}
      </form>
    </div>
  );
}

export default function TrainingTemplateManager({
  templates,
}: {
  templates: TrainingTemplate[];
}) {
  return (
    <div className="space-y-4">
      <AddForm />
      {templates.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No course templates yet. Add the first one above and it will seed
            every new company.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-white/60">
            {templates.length} course{templates.length === 1 ? "" : "s"} in the
            master catalogue.
          </p>
          {templates.map((t) => (
            <TemplateRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

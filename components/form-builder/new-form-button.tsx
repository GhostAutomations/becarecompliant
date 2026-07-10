"use client";

/**
 * Be Care Compliant — Form builder: create a new company form.
 * Opens an inline panel to make a blank form or duplicate an existing one, then
 * navigates into the builder. Canonical controls only.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompanyForm } from "@/lib/form-builder/actions";
import type { FormSummary, Population } from "@/lib/form-builder/types";

export default function NewFormButton({ forms }: { forms: FormSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [population, setPopulation] = useState<Population>("people");
  const [sourceFormId, setSourceFormId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const duplicateSources = forms.filter((f) => f.population === population);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCompanyForm({
        name,
        population,
        sourceFormId: sourceFormId || null,
      });
      if (res.error) setError(res.error);
      else if (res.redirectTo) router.push(res.redirectTo);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-4 py-2 text-sm">
        New form
      </button>
    );
  }

  return (
    <div className="glass-card w-full max-w-lg space-y-4 p-5">
      <h2 className="text-sm font-semibold text-white">New form</h2>

      <div>
        <label htmlFor="nf-name" className="form-label">
          Form name
        </label>
        <input
          id="nf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Night visit spot check"
        />
      </div>

      <div>
        <label htmlFor="nf-pop" className="form-label">
          Who is this form for?
        </label>
        <select
          id="nf-pop"
          value={population}
          onChange={(e) => {
            setPopulation(e.target.value as Population);
            setSourceFormId("");
          }}
        >
          <option value="people">People (staff)</option>
          <option value="service_users">Service Users</option>
        </select>
      </div>

      <div>
        <label htmlFor="nf-src" className="form-label">
          Start from
        </label>
        <select
          id="nf-src"
          value={sourceFormId}
          onChange={(e) => setSourceFormId(e.target.value)}
        >
          <option value="">A blank form</option>
          {duplicateSources.map((f) => (
            <option key={f.id} value={f.id}>
              Duplicate: {f.name}
            </option>
          ))}
        </select>
        <p className="form-hint">
          Duplicating copies the fields of an existing form as a starting point.
        </p>
      </div>

      {error && <p className="form-error mt-0">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim() === ""}
          className="btn-primary px-4 py-2 text-sm"
        >
          {pending ? "Creating…" : "Create and edit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="btn-ghost px-3 py-2 text-sm text-white/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

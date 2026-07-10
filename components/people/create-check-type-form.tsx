"use client";

/**
 * Be Care Compliant — create a new form-completion check type (Phase 5).
 * Shared by People and Service User settings. Ties a new Check to a published
 * form built in the form builder, then applies it to active and future Records.
 * Canonical controls only.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCheckType } from "@/lib/people/actions";

type PublishableForm = { id: string; name: string };
type Frequency = "day" | "week" | "month" | "year";

export default function CreateCheckTypeForm({
  population,
  forms,
}: {
  population: "people" | "service_users";
  forms: PublishableForm[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [formId, setFormId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("month");
  const [interval, setIntervalValue] = useState("3");
  const [amber, setAmber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function reset() {
    setName("");
    setFormId("");
    setFrequency("month");
    setIntervalValue("3");
    setAmber("");
  }

  function submit() {
    setError(null);
    setOk(null);
    const intervalNum = Number.parseInt(interval, 10);
    startTransition(async () => {
      const res = await createCheckType({
        population,
        name,
        formId,
        frequency,
        interval: intervalNum,
        amberDays: amber.trim() === "" ? null : Number.parseInt(amber, 10),
      });
      if (res.error) {
        setError(res.error);
      } else {
        setOk(res.ok ?? "Created.");
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (forms.length === 0) {
    return (
      <p className="text-xs text-white/45">
        To create a new check type, first build and publish a{" "}
        {population === "people" ? "People" : "Service User"} form in Settings, Forms.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {ok && <p className="text-xs text-emerald-300">{ok}</p>}
        <button type="button" onClick={() => setOpen(true)} className="btn-outline px-3 py-2 text-xs">
          New check type
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card space-y-4 p-5">
      <h3 className="text-sm font-semibold text-white">New check type</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ct-name" className="form-label">
            Check name
          </label>
          <input
            id="ct-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Night visit spot check"
          />
        </div>
        <div>
          <label htmlFor="ct-form" className="form-label">
            Form to complete
          </label>
          <select id="ct-form" value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">Choose a published form…</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ct-interval" className="form-label">
            Recurs every
          </label>
          <input
            id="ct-interval"
            type="number"
            min={1}
            value={interval}
            onChange={(e) => setIntervalValue(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="ct-freq" className="form-label">
            Period
          </label>
          <select
            id="ct-freq"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="day">Days</option>
            <option value="week">Weeks</option>
            <option value="month">Months</option>
            <option value="year">Years</option>
          </select>
        </div>
        <div>
          <label htmlFor="ct-amber" className="form-label">
            Amber days
          </label>
          <input
            id="ct-amber"
            type="number"
            min={0}
            value={amber}
            onChange={(e) => setAmber(e.target.value)}
            placeholder="Company default"
          />
        </div>
      </div>

      <p className="form-hint mt-0">
        The check is added to every active Record now, with a blank due date until the
        first completion, and to all future Records.
      </p>

      {error && <p className="form-error mt-0">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim() === "" || formId === ""}
          className="btn-primary px-4 py-2 text-sm"
        >
          {pending ? "Creating…" : "Create check type"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="btn-ghost px-3 py-2 text-sm text-white/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { saveOutcomes } from "@/lib/service-users/outcomes-actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { OUTCOME_STATUSES, type OutcomeRow, type OutcomeStatus } from "@/lib/service-users/outcome-consts";

type Row = { statement: string; status: OutcomeStatus; last_reviewed: string; review_note: string };

function newRow(): Row {
  return { statement: "", status: "working_towards", last_reviewed: "", review_note: "" };
}

export default function OutcomesEditor({
  serviceUserId,
  initial,
}: {
  serviceUserId: string;
  initial: OutcomeRow[];
}) {
  const [state, formAction, pending] = useActionState(saveOutcomes, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  const [rows, setRows] = useState<Row[]>(
    initial.length
      ? initial.map((o) => ({
          statement: o.statement,
          status: o.status,
          last_reviewed: o.last_reviewed ?? "",
          review_note: o.review_note ?? "",
        }))
      : [newRow()],
  );

  useEffect(() => {
    if (state.ok && !pending) flash();
  }, [state, pending, flash]);
  const showSaved = saved && !pending;

  function update(i: number, patch: Partial<Row>) {
    reset();
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    reset();
    setRows((prev) => [...prev, newRow()]);
  }
  function removeRow(i: number) {
    reset();
    setRows((prev) => (prev.length === 1 ? [newRow()] : prev.filter((_, idx) => idx !== i)));
  }

  const outcomesJson = JSON.stringify(
    rows
      .filter((r) => r.statement.trim() !== "")
      .map((r) => ({
        statement: r.statement,
        status: r.status,
        last_reviewed: r.last_reviewed || null,
        review_note: r.review_note || null,
      })),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="service_user_id" value={serviceUserId} />
      <input type="hidden" name="outcomes" value={outcomesJson} />

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="glass-card space-y-3 p-4">
            <div className="flex items-start gap-2">
              <textarea
                aria-label="Outcome"
                value={r.statement}
                onChange={(e) => update(i, { statement: e.target.value })}
                rows={2}
                placeholder="What matters to this person, e.g. I want to keep getting to my art class each week."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="mt-2 text-white/40 hover:text-red-300"
                aria-label="Remove outcome"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="form-label">Status</label>
                <select value={r.status} onChange={(e) => update(i, { status: e.target.value as OutcomeStatus })}>
                  {OUTCOME_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Last reviewed</label>
                <input type="date" value={r.last_reviewed} onChange={(e) => update(i, { last_reviewed: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Review note (optional)</label>
                <input
                  type="text"
                  value={r.review_note}
                  onChange={(e) => update(i, { review_note: e.target.value })}
                  placeholder="How it is going"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <button type="button" onClick={addRow} className="btn-outline text-xs">Add outcome</button>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={`btn ${showSaved ? "btn-saved" : "btn-primary"}`}>
          {pending ? "Saving…" : showSaved ? "Saved" : "Save outcomes"}
        </button>
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

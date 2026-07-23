"use client";

import { useActionState, useEffect, useState } from "react";
import { createShift, updateShift, deleteShift } from "@/lib/on-call/actions";
import { IDLE_STATE } from "@/lib/forms";
import { toLocalInput } from "@/lib/on-call/format";
import type { BranchOption, OnCallShift, PersonOption } from "@/lib/on-call/types";

/** Add or edit an on-call rota shift. Reused for both; `shift` present = edit. */
export default function ShiftForm({
  branches,
  people,
  shift,
  onDone,
}: {
  branches: BranchOption[];
  people: PersonOption[];
  shift?: OnCallShift;
  onDone?: () => void;
}) {
  const editing = !!shift;
  const [state, formAction, pending] = useActionState(
    editing ? updateShift : createShift,
    IDLE_STATE,
  );
  const [usePerson, setUsePerson] = useState(!shift || !!shift.on_call_profile_id);

  // Close the form once a save succeeds.
  useEffect(() => {
    if (state.ok && onDone) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="glass-card space-y-4 p-5">
      {editing ? <input type="hidden" name="id" value={shift.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
          <select id="branch_id" name="branch_id" required defaultValue={shift?.branch_id ?? ""}>
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="phone" className="form-label">On-call phone</label>
          <input id="phone" name="phone" defaultValue={shift?.phone ?? ""} placeholder="e.g. 07700 900000" />
        </div>

        <div>
          <label htmlFor="starts_at" className="form-label">Starts *</label>
          <input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={toLocalInput(shift?.starts_at ?? null)} />
        </div>

        <div>
          <label htmlFor="ends_at" className="form-label">Ends *</label>
          <input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={toLocalInput(shift?.ends_at ?? null)} />
        </div>

        <div className="sm:col-span-2">
          <label className="form-label">On call</label>
          <div className="mb-2 flex gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2">
              <input type="radio" name="_who" checked={usePerson} onChange={() => setUsePerson(true)} />
              A team member
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="_who" checked={!usePerson} onChange={() => setUsePerson(false)} />
              Someone else
            </label>
          </div>
          {usePerson ? (
            <select name="on_call_profile_id" defaultValue={shift?.on_call_profile_id ?? ""}>
              <option value="">Please choose</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <input name="on_call_name" defaultValue={shift?.on_call_name ?? ""} placeholder="Name of the person on call" />
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="form-label">Notes</label>
          <textarea id="notes" name="notes" rows={2} defaultValue={shift?.notes ?? ""} placeholder="Anything the on-call person should know" />
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save shift" : "Add shift"}
        </button>
        {onDone ? (
          <button type="button" className="btn-ghost" onClick={onDone} disabled={pending}>Cancel</button>
        ) : null}
        {editing ? <DeleteShiftButton id={shift.id} onDone={onDone} /> : null}
      </div>
    </form>
  );
}

function DeleteShiftButton({ id, onDone }: { id: string; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState(deleteShift, IDLE_STATE);
  useEffect(() => {
    if (state.ok && onDone) onDone();
  }, [state.ok, onDone]);
  return (
    <form
      action={formAction}
      className="ml-auto"
      onSubmit={(e) => {
        if (!confirm("Remove this shift from the rota?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-sm font-medium text-red-300 hover:text-red-200" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { updateDisclosure } from "@/lib/whistleblowing/actions";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { DisclosureRecord } from "@/lib/whistleblowing/types";
import DisclosureFields from "./disclosure-fields";

export default function EditDisclosureForm({
  record,
  branches,
  todayIso,
}: {
  record: DisclosureRecord;
  branches: Array<{ id: string; name: string }>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(updateDisclosure, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !pending) flash(); }, [state, pending, flash]);

  return (
    <form action={formAction} className="space-y-6" onChange={reset}>
      <input type="hidden" name="disclosure_id" value={record.id} />

      <DisclosureFields
        idPrefix="edit_disclosure"
        record={record}
        branches={branches}
        todayIso={todayIso}
        onEdit={reset}
      />

      <div>
        <label htmlFor="outcome" className="form-label">Outcome</label>
        <textarea
          id="outcome"
          name="outcome"
          rows={3}
          defaultValue={record.outcome ?? ""}
          placeholder="What was concluded, and what changed as a result."
        />
        <p className="form-hint">
          The six monthly Quality of Care Review reports how disclosures were dealt with, not
          who made them.
        </p>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className={saved ? "btn-saved" : "btn-primary"} disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

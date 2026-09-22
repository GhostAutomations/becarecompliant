"use client";

/**
 * Delete a person's record — the last resort, behind a confirmation.
 *
 * WHY IT LOOKS LIKE THIS (Phil, 2026-09-22). Deleting a carer is the most destructive thing in
 * this product, and it is offered beside Transfer and Edit, which are not. So it is fenced off
 * at the bottom of the panel, it says in words what it is for and what it is not, and it makes
 * you type the person's name before the button does anything.
 *
 * TYPING THE NAME IS NOT THEATRE. Everything else on this panel is reversible; this is the only
 * control on the record that destroys something. The name has to be typed because the record
 * being deleted and the record you meant to delete are, by definition, hard to tell apart when
 * somebody has just added a duplicate.
 *
 * THE SERVER DECIDES, NOT THIS. The action counts what exists against the record and refuses if
 * there is anything at all (lib/people/deletable.ts). This form cannot know that, and does not
 * pretend to: it sends the request and prints whatever the server says back, which is a sentence
 * naming exactly what is in the way.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { deletePerson } from "@/lib/people/actions";
import { nameConfirmed } from "@/lib/people/deletable";

export default function DeletePersonForm({
  personId,
  fullName,
}: {
  personId: string;
  fullName: string;
}) {
  const [typed, setTyped] = useState("");
  /* The SAME rule the server applies, from the same function, so the button and the action can
     never disagree about whether the name was typed. */
  const matches = nameConfirmed(typed, fullName);

  return (
    <div className="border-t border-white/10 pt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">
        Delete this record
      </h3>
      <p className="mb-3 text-sm text-white/60">
        For a record added by mistake: a duplicate, a wrong name, somebody added to the wrong
        company. <strong className="text-white/80">Not for somebody who has left:</strong> mark
        them as a leaver instead, so their evidence is kept. A record with anything at all
        against it cannot be deleted, and this will say what is in the way.
      </p>
      <ActionForm
        action={deletePerson}
        hidden={{ person_id: personId }}
        label="Delete this record"
        savedLabel="Deleted"
        buttonClassName={
          matches
            ? "rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white"
            : "cursor-not-allowed rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white/30"
        }
        confirm={`Delete ${fullName}? This cannot be undone.`}
        disabled={!matches}
      >
        <label htmlFor={`confirm-${personId}`} className="form-label">
          Type <span className="text-white/80">{fullName}</span> to confirm
        </label>
        <input
          id={`confirm-${personId}`}
          name="confirm_name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          placeholder={fullName}
        />
      </ActionForm>
    </div>
  );
}

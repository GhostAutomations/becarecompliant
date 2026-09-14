"use client";

/**
 * Be Care Compliant — the company's customer satisfaction questions.
 *
 * Phil, 2026-09-12. These are the questions that become the PQS customer satisfaction
 * percentage, so the screen says that plainly at the top: somebody adding a question here
 * is changing what the regulator reads, and that should never be a surprise.
 *
 * Removing a question does NOT change a review already completed. That is worth saying on
 * the screen rather than only in the code, because it is the thing an admin will worry
 * about before they click.
 */

import { useActionState, useEffect, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  addSatisfactionQuestion,
  removeSatisfactionQuestion,
  renameSatisfactionQuestion,
} from "@/lib/service-users/satisfaction-settings";
import type { SatisfactionQuestion } from "@/lib/service-users/satisfaction-questions";

function QuestionRow({ q }: { q: SatisfactionQuestion }) {
  const [label, setLabel] = useState(q.label);
  const [renameState, rename, renaming] = useActionState(renameSatisfactionQuestion, IDLE_STATE);
  const [removeState, remove, removing] = useActionState(removeSatisfactionQuestion, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (renameState.ok && !renaming) flash(); }, [renameState, renaming, flash]);

  const dirty = label.trim() !== q.label;

  return (
    <div className="rounded-xl border border-white/10 px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <form action={rename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="key" value={q.key} />
          <input
            name="label"
            value={label}
            onChange={(e) => { setLabel(e.target.value); reset(); }}
            className="min-w-0 flex-1"
            aria-label="Question"
          />
          <button
            type="submit"
            disabled={renaming || !dirty}
            className={`btn ${saved ? "btn-saved" : "btn-outline"}`}
          >
            {renaming ? "Saving…" : saved ? "Saved" : "Save wording"}
          </button>
        </form>
        <form action={remove}>
          <input type="hidden" name="key" value={q.key} />
          <button type="submit" disabled={removing} className="btn-outline">
            {removing ? "Removing…" : "Remove"}
          </button>
        </form>
      </div>
      <p className="form-hint">
        {q.custom ? "Your own question" : "Included as standard"} · answered Yes or No, with a
        box asking what is wrong on a No
      </p>
      {renameState.error ? <p className="form-error">{renameState.error}</p> : null}
      {removeState.error ? <p className="form-error">{removeState.error}</p> : null}
      {removeState.ok ? <p className="text-sm text-rag-green-soft">{removeState.ok}</p> : null}
    </div>
  );
}

export default function SatisfactionQuestionsForm({
  questions,
}: {
  questions: SatisfactionQuestion[];
}) {
  const [state, add, adding] = useActionState(addSatisfactionQuestion, IDLE_STATE);

  return (
    <div className="space-y-4">
      <p className="page-subtitle">
        These questions are the customer satisfaction percentage in your PQS return. They are
        asked on the Individual Plan Review, and every one of them is answered Yes or No, a
        Yes counting as satisfied. They can only be changed here, not in the form builder, so
        that the score cannot be altered by tidying a form.
      </p>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-rag-red/30 px-4 py-3 text-sm text-rag-red-soft">
          No questions are being scored, so customer satisfaction will show as n/a on the PQS
          report. Add at least one below.
        </p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => <QuestionRow key={q.key} q={q} />)}
        </div>
      )}

      <form action={add} className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="new_satisfaction_q" className="form-label">Add a question</label>
          <input
            id="new_satisfaction_q"
            name="label"
            placeholder="Are you happy with the care workers who visit you?"
          />
        </div>
        <button type="submit" disabled={adding} className="btn-primary">
          {adding ? "Adding…" : "Add question"}
        </button>
      </form>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-rag-green-soft">{state.ok}</p> : null}

      <p className="form-hint">
        Changing this list never changes a review already completed. Each review is scored on
        the questions it actually asked, so a percentage you have already reported stays as it
        was.
      </p>
    </div>
  );
}

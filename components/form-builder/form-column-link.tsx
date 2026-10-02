"use client";

/**
 * Be Care Compliant — link a form to a register column (a compliance check) from
 * the Forms list. Kept out of the row's Link so selecting never navigates to the editor.
 *
 * ASKS BEFORE IT BREAKS A COLUMN (DEF-108, Phil, 2 Oct 2026, popup "Both guards"). The dropdown
 * saved the moment it changed, so choosing Spot Check on the Annual Appraisal form and then
 * putting it back left Thistle's Spot Check column with no form at all: nobody could complete a
 * spot check, from the record or the Planner, and nothing said why. A change that would leave a
 * column without its form, or take a column's form away from it, now says so and waits for
 * "Change it". A change that only links a form to an empty column still saves straight away.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { setFormColumnLink } from "@/app/(app)/settings/forms/actions";

export type ColumnChoice = {
  id: string;
  name: string;
  /** The form this column uses now, if any. */
  formId: string | null;
  formName: string | null;
};

export default function FormColumnLink({
  formId,
  formName,
  checks,
  currentCheckId,
}: {
  formId: string;
  formName: string;
  checks: ColumnChoice[];
  currentCheckId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentCheckId);
  const [asking, setAsking] = useState<{ next: string; lines: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(next: string) {
    setValue(next);
    setAsking(null);
    setError(null);
    const fd = new FormData();
    fd.set("form_id", formId);
    fd.set("check_id", next);
    startTransition(async () => {
      const res = await setFormColumnLink(IDLE_STATE, fd);
      if (res.error) {
        setError(res.error);
        setValue(currentCheckId);
      } else router.refresh();
    });
  }

  function onChange(next: string) {
    if (next === value) return;
    const lines: string[] = [];
    const current = checks.find((c) => c.id === value);
    const chosen = checks.find((c) => c.id === next);
    if (current) {
      lines.push(`${current.name} will have no form, so nobody can complete a ${current.name} until a form is linked to it again.`);
    }
    if (chosen && chosen.formId && chosen.formId !== formId) {
      lines.push(`${chosen.name} uses ${chosen.formName ?? "another form"} now. It will use ${formName} instead.`);
    }
    if (lines.length === 0) save(next);
    else setAsking({ next, lines });
  }

  return (
    <span className="block">
      <select
        aria-label="Link this form to a column"
        value={asking ? asking.next : value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full max-w-[11rem] text-xs ${error ? "border-rag-red" : ""}`}
      >
        <option value="">No column</option>
        {checks.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {asking ? (
        <span role="alertdialog" className="mt-2 block rounded-xl border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-100">
          {asking.lines.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
          <span className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-xs" onClick={() => save(asking.next)}>
              Change it
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={() => setAsking(null)}>
              Keep as it was
            </button>
          </span>
        </span>
      ) : null}
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : null}
    </span>
  );
}

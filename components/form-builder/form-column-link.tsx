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

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { addFormColumn, setFormColumnLink } from "@/app/(app)/settings/forms/actions";

/** The dropdown choice that opens "Add a new column" rather than linking (2 Oct 2026). */
const NEW_COLUMN = "__new_column__";

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

  /* FOLLOW THE SAVED LINK (Phil, 2 Oct 2026: "i created the column ... then had to go back and
     select it"). After a save the page refreshes with the new link, and the dropdown now shows it
     rather than what it held when the page first drew. */
  useEffect(() => {
    setValue(currentCheckId);
  }, [currentCheckId]);

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

  /* ADD A NEW COLUMN (Phil, 2 Oct 2026): make the check, link this form and show it on the
     register, from here, in one step. */
  const [adding, setAdding] = useState(false);
  const [colName, setColName] = useState(formName);
  const [every, setEvery] = useState("1");
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [amber, setAmber] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const currentCol = checks.find((c) => c.id === value);
  useEffect(() => {
    if (!addOk) return;
    const t = setTimeout(() => setAddOk(null), 6000);
    return () => clearTimeout(t);
  }, [addOk]);

  function add() {
    setAddError(null);
    const fd = new FormData();
    fd.set("form_id", formId);
    fd.set("name", colName.trim());
    fd.set("interval", every.trim());
    fd.set("frequency", period);
    fd.set("amber_days", amber.trim());
    startTransition(async () => {
      const res = await addFormColumn(IDLE_STATE, fd);
      if (res.error) setAddError(res.error);
      else {
        setAdding(false);
        setAddOk(res.ok ?? "Added.");
        router.refresh();
      }
    });
  }

  function onChange(next: string) {
    if (next === NEW_COLUMN) {
      setAddOk(null);
      setAddError(null);
      setColName(formName);
      setAdding(true);
      return;
    }
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
    /* NOTHING UNDER THE DROPDOWN (Phil, 2 Oct 2026: "i dont like the text making the line higher,
       put it to the left of the drop down"). Messages sit to the LEFT of it, over the row's empty
       space, and the warnings open as a box over the page, so a row never changes height. */
    <span className="relative block">
      {addOk || error ? (
        <span
          role="status"
          className={`pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap text-xs ${error ? "text-red-300" : "text-emerald-300"}`}
          title={error ?? addOk ?? undefined}
        >
          {error ? "Not saved" : "Column added"}
        </span>
      ) : null}
      <select
        aria-label="Link this form to a column"
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full max-w-[11rem] text-xs ${error ? "border-rag-red" : ""}`}
      >
        <option value="">No column</option>
        {checks.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NEW_COLUMN}>+ Add a new column</option>
      </select>
      {asking
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAsking(null)}>
              <div
                role="alertdialog"
                aria-modal="true"
                className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-white">Change the column for {formName}?</h2>
                {asking.lines.map((l) => (
                  <p key={l} className="text-sm text-amber-100">{l}</p>
                ))}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => save(asking.next)}>
                    Change it
                  </button>
                  <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setAsking(null)}>
                    Keep as it was
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {adding
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !pending && setAdding(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`add-col-${formId}`}
                className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <h2 id={`add-col-${formId}`} className="text-lg font-semibold text-white">Add a new column</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Every active record gets a {colName.trim() || "new"} check, completed with {formName}, and it shows on the register.
                  </p>
                </div>
                <div>
                  <label htmlFor={`col-name-${formId}`} className="form-label">Column name</label>
                  <input id={`col-name-${formId}`} value={colName} onChange={(e) => setColName(e.target.value)} disabled={pending} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`col-every-${formId}`} className="form-label">Recurs every</label>
                    <input id={`col-every-${formId}`} type="number" min={1} value={every} onChange={(e) => setEvery(e.target.value)} disabled={pending} />
                  </div>
                  <div>
                    <label htmlFor={`col-period-${formId}`} className="form-label">Period</label>
                    <select id={`col-period-${formId}`} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} disabled={pending}>
                      <option value="day">Days</option>
                      <option value="week">Weeks</option>
                      <option value="month">Months</option>
                      <option value="year">Years</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`col-amber-${formId}`} className="form-label">Amber days</label>
                    <input id={`col-amber-${formId}`} type="number" min={0} value={amber} onChange={(e) => setAmber(e.target.value)} placeholder="Default" disabled={pending} />
                  </div>
                </div>
                {currentCol ? (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-100">
                    {formName} is linked to {currentCol.name} now. {currentCol.name} will have no form, so nobody can complete a {currentCol.name} until a form is linked to it again.
                  </p>
                ) : null}
                <p className="form-hint mt-0">Each record starts with no due date until its first completion.</p>
                {addError ? <p className="form-error mt-0">{addError}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={add} disabled={pending || colName.trim() === ""}>
                    {pending ? "Adding…" : "Add column"}
                  </button>
                  <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => setAdding(false)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
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
    </span>
  );
}

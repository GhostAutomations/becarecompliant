"use client";

import { useActionState, useEffect, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { REG73_SECTIONS, REG73_AI_FIELDS } from "@/lib/reg73/spec";
import { saveReg73, submitReg73, aiDraftReg73, refreshReg73Data } from "@/lib/reg73/actions";
import type { Reg73VisitFull } from "@/lib/reg73/data";
import Reg73Signature from "@/components/reg73/reg73-signature";

/** Data derived boxes, pre-filled from the site and re-pulled by Refresh data. Kept
 *  in client state so a refresh updates them in place, with no remount. */
const DATA_FIELDS = ["kpi_dashboard", "prev_actions_status"];

function fmtDate(v: string): string {
  if (!v) return "Not answered";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

export default function Reg73Form({
  visit,
  canEdit,
  signatories,
}: {
  visit: Reg73VisitFull;
  branchName: string;
  canEdit: boolean;
  signatories: string[];
}) {
  const data = (visit.data ?? {}) as Record<string, string>;
  const val = (k: string) => (typeof data[k] === "string" ? data[k] : "");

  const [aiValues, setAiValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of REG73_AI_FIELDS) init[k] = val(k);
    return init;
  });
  const [dataValues, setDataValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of DATA_FIELDS) init[k] = val(k);
    return init;
  });
  const [gold, setGold] = useState<Set<string>>(
    () => new Set((val("_ai_fields") || "").split(",").filter(Boolean)),
  );
  const [drafting, setDrafting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const [saveState, saveAction, savePending] = useActionState(saveReg73, IDLE_STATE);
  const [submitState, submitAction, submitPending] = useActionState(submitReg73, IDLE_STATE);
  const [saved, flashSaved, resetSaved] = useSavedFlash();
  const busy = savePending || submitPending || refreshing || drafting;

  useEffect(() => {
    // After submit the visit becomes read only in place (the server action revalidates
    // the route); move the scroll container that actually scrolls, <main>, to the top so
    // the Download PDF button is in view. No router.refresh here: it would re-apply Next's
    // scroll restoration and undo this.
    if (submitState.ok) {
      requestAnimationFrame(() => {
        const m = document.querySelector("main");
        if (m) m.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    }
  }, [submitState.ok]);
  useEffect(() => {
    // Save draft: the button turns green and reads "Saved" until the form is edited.
    if (saveState.ok) flashSaved();
  }, [saveState, flashSaved]);

  async function draftWithAi() {
    setDrafting(true);
    setOpError(null);
    resetSaved();
    const fd = new FormData();
    fd.set("visit_id", visit.id);
    const res = await aiDraftReg73(IDLE_STATE, fd);
    setDrafting(false);
    if (res.error || !res.ok) {
      setOpError(res.error ?? "Could not draft.");
      return;
    }
    try {
      const drafted = JSON.parse(res.ok) as Record<string, string>;
      const nextGold = new Set(gold);
      setAiValues((prev) => {
        const next = { ...prev };
        for (const k of REG73_AI_FIELDS) {
          if (typeof drafted[k] === "string" && drafted[k].trim()) {
            next[k] = drafted[k].trim();
            nextGold.add(k);
          }
        }
        return next;
      });
      setGold(nextGold);
    } catch {
      setOpError("Could not read the AI draft. Try again.");
    }
  }

  async function refreshData() {
    setRefreshing(true);
    setOpError(null);
    resetSaved();
    const fd = new FormData();
    fd.set("visit_id", visit.id);
    const res = await refreshReg73Data(IDLE_STATE, fd);
    setRefreshing(false);
    if (res.error || !res.ok) {
      setOpError(res.error ?? "Could not refresh the data.");
      return;
    }
    try {
      const fresh = JSON.parse(res.ok) as Record<string, string>;
      setDataValues((prev) => {
        const next = { ...prev };
        for (const k of DATA_FIELDS) if (typeof fresh[k] === "string") next[k] = fresh[k];
        return next;
      });
    } catch {
      setOpError("Could not read the refreshed data. Try again.");
    }
  }

  // The submit error shows next to the Save and submit button in the Sign off box; the
  // top toolbar only shows errors from its own actions (save, refresh, AI draft).
  const error = saveState.error || opError;
  const riOptions = Array.from(new Set([val("ri_name"), ...signatories].filter(Boolean)));

  // Read-only (submitted, or the viewer cannot edit).
  if (!canEdit || visit.status === "submitted") {
    return (
      <div className="space-y-4">
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-white/55">
            {visit.status === "submitted"
              ? "This visit is submitted and locked. Download it as a PDF for CIW or your records."
              : "You can view this visit. Only the Responsible Individual or an Admin can edit it."}
          </p>
          <a href={`/api/reports/reg73/${visit.id}/pdf`} className="btn-primary px-4 py-2 text-sm">
            Download PDF
          </a>
        </div>

        {REG73_SECTIONS.map((section) => (
          <div key={section.title} className="glass-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
            <dl className="space-y-3">
              {section.fields.map((f) => (
                <div key={f.key} className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
                  <dt className="text-xs text-white/45">{f.label}</dt>
                  <dd className={`mt-0.5 whitespace-pre-wrap text-sm ${gold.has(f.key) ? "text-gold-300" : "text-white/90"}`}>
                    {f.type === "signature" ? (
                      val(f.key).startsWith("data:image") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={val(f.key)} alt="Responsible Individual signature" className="mt-1 h-20 rounded bg-white p-1" />
                      ) : val("sign_method") === "printed" ? (
                        "To be signed on the printed version"
                      ) : (
                        "Not signed"
                      )
                    ) : f.type === "date" ? (
                      fmtDate(val(f.key))
                    ) : (
                      val(f.key).trim() || "Not answered"
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  // Editable draft.
  return (
    <form className="space-y-4" onChange={resetSaved}>
      <input type="hidden" name="visit_id" value={visit.id} />
      <input type="hidden" name="_ai_fields" value={[...gold].join(",")} />

      <div className="glass-card flex flex-wrap items-center gap-2 p-3">
        <button
          type="submit"
          formAction={saveAction}
          disabled={busy}
          className={saved && !savePending ? "btn-saved px-3 py-2 text-xs" : "btn-primary px-3 py-2 text-xs"}
        >
          {savePending ? "Saving…" : saved ? "Saved" : "Save draft"}
        </button>
        <button type="button" onClick={refreshData} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
        <button type="button" onClick={draftWithAi} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {drafting ? "Drafting…" : "Draft narrative with AI"}
        </button>
        {error ? <span className="w-full text-xs font-semibold text-red-400">{error}</span> : null}
      </div>

      {REG73_SECTIONS.map((section) => {
        if (section.title === "Sign off") {
          return (
            <div key={section.title} className="glass-card space-y-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
              <Reg73Signature defaultMethod={val("sign_method")} defaultSignature={val("ri_signature")} />
              <div className="flex flex-wrap items-center justify-end gap-3">
                {submitState.error ? <span className="text-xs font-semibold text-red-400">{submitState.error}</span> : null}
                <button type="submit" formAction={submitAction} disabled={busy} className="btn-primary px-4 py-2 text-sm">
                  {submitPending ? "Submitting…" : "Save and submit"}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={section.title} className="glass-card space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
              {section.intro ? <p className="mt-1 text-xs text-white/45">{section.intro}</p> : null}
            </div>
            {section.fields.map((f) => {
              const id = `f_${f.key}`;
              const isAi = REG73_AI_FIELDS.includes(f.key);
              const isData = DATA_FIELDS.includes(f.key);
              const isGold = gold.has(f.key);
              return (
                <div key={f.key}>
                  <label htmlFor={id} className="form-label flex items-center gap-2">
                    {f.label}
                    {f.ai ? (
                      <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold text-gold-300">AI</span>
                    ) : null}
                  </label>
                  {f.key === "ri_name" ? (
                    <select id={id} name={f.key} defaultValue={val(f.key)} className="mt-1 max-w-xs">
                      {riOptions.length === 0 ? <option value="">Not set</option> : null}
                      {riOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "yesno" ? (
                    <select id={id} name={f.key} defaultValue={val(f.key)} className="mt-1 max-w-[8rem]">
                      <option value="">Not answered</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  ) : f.type === "date" ? (
                    <input id={id} name={f.key} type="date" defaultValue={val(f.key).slice(0, 10)} className="mt-1 max-w-[12rem]" />
                  ) : isData ? (
                    <textarea
                      id={id}
                      name={f.key}
                      rows={3}
                      value={dataValues[f.key] ?? ""}
                      onChange={(e) => setDataValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="mt-1 w-full"
                    />
                  ) : isAi ? (
                    <textarea
                      id={id}
                      name={f.key}
                      rows={3}
                      value={aiValues[f.key] ?? ""}
                      onChange={(e) => setAiValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      className={`mt-1 w-full ${isGold ? "text-gold-300" : ""}`}
                    />
                  ) : (
                    <textarea id={id} name={f.key} rows={3} defaultValue={val(f.key)} className="mt-1 w-full" />
                  )}
                  {f.hint ? <p className="form-hint">{f.hint}</p> : null}
                </div>
              );
            })}
          </div>
        );
      })}

      <p className="text-xs text-white/40">
        The KPI, previous actions and complaints boxes are pre-filled from the site. Refresh data
        re-pulls them. Draft narrative with AI fills the tagged boxes in gold for you to edit. Choose
        a signature option and save and submit to lock the visit.
      </p>
    </form>
  );
}

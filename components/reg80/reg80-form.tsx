"use client";

import { useActionState, useEffect, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { REG80_SECTIONS, REG80_AI_FIELDS, REG80_DATA_FIELDS } from "@/lib/reg80/spec";
import { saveReg80, submitReg80, aiDraftReg80, refreshReg80Data } from "@/lib/reg80/actions";
import type { Reg80ReviewFull } from "@/lib/reg80/data";
import Reg73Signature from "@/components/reg73/reg73-signature";
import Reg80ImageInput from "@/components/reg80/reg80-image-input";

function fmtDate(v: string): string {
  if (!v) return "Not answered";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

export default function Reg80Form({
  review,
  canEdit,
  signatories,
}: {
  review: Reg80ReviewFull;
  branchName: string;
  canEdit: boolean;
  signatories: string[];
}) {
  const data = (review.data ?? {}) as Record<string, string>;
  const val = (k: string) => (typeof data[k] === "string" ? data[k] : "");

  const [aiValues, setAiValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of REG80_AI_FIELDS) init[k] = val(k);
    return init;
  });
  const [dataValues, setDataValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of REG80_DATA_FIELDS) init[k] = val(k);
    return init;
  });
  const [gold, setGold] = useState<Set<string>>(
    () => new Set((val("_ai_fields") || "").split(",").filter(Boolean)),
  );
  const [drafting, setDrafting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offerRedraft, setOfferRedraft] = useState(false);
  const [imagesBusy, setImagesBusy] = useState(0);
  const [opError, setOpError] = useState<string | null>(null);

  const [saveState, saveAction, savePending] = useActionState(saveReg80, IDLE_STATE);
  const [submitState, submitAction, submitPending] = useActionState(submitReg80, IDLE_STATE);
  const [saved, flashSaved, resetSaved] = useSavedFlash();
  const busy = savePending || submitPending || refreshing || drafting || imagesBusy > 0;

  useEffect(() => {
    // After submit the review becomes read only in place (the server action revalidates
    // the route); move the scroll container that actually scrolls, <main>, to the top so
    // the Download PDF button is in view. No router.refresh: it re-applies scroll restoration.
    if (submitState.ok) {
      requestAnimationFrame(() => {
        const m = document.querySelector("main");
        if (m) m.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    }
  }, [submitState.ok]);
  useEffect(() => {
    if (saveState.ok) flashSaved();
  }, [saveState, flashSaved]);

  async function draftWithAi() {
    setDrafting(true);
    setOpError(null);
    resetSaved();
    setOfferRedraft(false);
    const fd = new FormData();
    fd.set("review_id", review.id);
    const res = await aiDraftReg80(IDLE_STATE, fd);
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
        for (const k of REG80_AI_FIELDS) {
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
    fd.set("review_id", review.id);
    // Pass the period the RI currently has in the form, so refresh refigures for those dates.
    const ps = (document.getElementById("f_period_start") as HTMLInputElement | null)?.value ?? "";
    const pe = (document.getElementById("f_period_end") as HTMLInputElement | null)?.value ?? "";
    if (ps) fd.set("period_start", ps);
    if (pe) fd.set("period_end", pe);
    const res = await refreshReg80Data(IDLE_STATE, fd);
    setRefreshing(false);
    if (res.error || !res.ok) {
      setOpError(res.error ?? "Could not refresh the data.");
      return;
    }
    try {
      const fresh = JSON.parse(res.ok) as Record<string, string>;
      setDataValues((prev) => {
        const next = { ...prev };
        for (const k of REG80_DATA_FIELDS) if (typeof fresh[k] === "string") next[k] = fresh[k];
        return next;
      });
      setOfferRedraft(true);
    } catch {
      setOpError("Could not read the refreshed data. Try again.");
    }
  }

  const error = submitState.error || saveState.error || opError;
  const riOptions = Array.from(new Set([val("ri_name"), ...signatories].filter(Boolean)));

  // Read-only (submitted, or the viewer cannot edit).
  if (!canEdit || review.status === "submitted") {
    return (
      <div className="space-y-4">
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-white/55">
            {review.status === "submitted"
              ? "This review is submitted and locked. Download it as a PDF for CIW or your records."
              : "You can view this review. Only the Responsible Individual or an Admin can edit it."}
          </p>
          <a href={`/api/reports/reg80/${review.id}/pdf`} className="btn-primary px-4 py-2 text-sm">
            Download PDF
          </a>
        </div>

        {REG80_SECTIONS.map((section) => (
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
                    ) : f.type === "image" ? (
                      val(f.key).startsWith("data:image") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={val(f.key)} alt={f.label} className="mt-1 max-h-48 rounded border border-white/15 bg-white p-1" />
                      ) : (
                        "Not provided"
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
    <form
      className="space-y-4"
      onChange={() => {
        resetSaved();
        setOfferRedraft(false);
      }}
    >
      <input type="hidden" name="review_id" value={review.id} />
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
        {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
      </div>

      {offerRedraft ? (
        <div className="glass-card flex flex-wrap items-center gap-3 border border-gold-400/30 p-3">
          <span className="text-sm text-white/80">
            The figures have been refreshed. Update the narrative from the new figures?
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setOfferRedraft(false);
                await draftWithAi();
              }}
              disabled={busy}
              className="btn-primary px-3 py-2 text-xs"
            >
              Update narrative
            </button>
            <button
              type="button"
              onClick={() => setOfferRedraft(false)}
              className="btn-outline px-3 py-2 text-xs"
            >
              Keep mine
            </button>
          </div>
        </div>
      ) : null}

      {REG80_SECTIONS.map((section) => {
        if (section.title === "Sign off") {
          return (
            <div key={section.title} className="glass-card space-y-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
              <Reg73Signature defaultMethod={val("sign_method")} defaultSignature={val("ri_signature")} />
              <div className="flex justify-end">
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
              const isAi = REG80_AI_FIELDS.includes(f.key);
              const isData = REG80_DATA_FIELDS.includes(f.key);
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
                  ) : f.type === "image" ? (
                    <Reg80ImageInput
                      name={f.key}
                      defaultValue={val(f.key)}
                      onBusyChange={(b) => setImagesBusy((n) => Math.max(0, n + (b ? 1 : -1)))}
                    />
                  ) : isData ? (
                    <textarea
                      id={id}
                      name={f.key}
                      rows={4}
                      value={dataValues[f.key] ?? ""}
                      onChange={(e) => setDataValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="mt-1 w-full"
                    />
                  ) : isAi ? (
                    <textarea
                      id={id}
                      name={f.key}
                      rows={4}
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
        The data boxes are pre-filled from the site for the review period above. Change the period and
        Refresh data to re-pull every figure for those dates, then choose whether to update the
        narrative to match. Draft narrative with AI fills the tagged boxes in gold for you to edit. The
        incidents, safeguarding and whistleblowing boxes are for you to complete. Choose a signature
        option and save and submit to lock the review.
      </p>
    </form>
  );
}

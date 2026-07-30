"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { REG73_SECTIONS, REG73_AI_FIELDS } from "@/lib/reg73/spec";
import { saveReg73, submitReg73, aiDraftReg73, refreshReg73Data } from "@/lib/reg73/actions";
import type { Reg73VisitFull } from "@/lib/reg73/data";
import SignaturePad from "@/components/reg73/signature-pad";

function fmtDate(v: string): string {
  if (!v) return "Not answered";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

export default function Reg73Form({
  visit,
  canEdit,
}: {
  visit: Reg73VisitFull;
  branchName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const data = (visit.data ?? {}) as Record<string, string>;
  const val = (k: string) => (typeof data[k] === "string" ? data[k] : "");

  // AI fields are controlled so AI can fill them and they can render in gold.
  const [aiValues, setAiValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of REG73_AI_FIELDS) init[k] = val(k);
    return init;
  });
  const [gold, setGold] = useState<Set<string>>(
    () => new Set((val("_ai_fields") || "").split(",").filter(Boolean)),
  );
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [saveState, saveAction, savePending] = useActionState(saveReg73, IDLE_STATE);
  const [submitState, submitAction, submitPending] = useActionState(submitReg73, IDLE_STATE);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshReg73Data, IDLE_STATE);
  const busy = savePending || submitPending || refreshPending || drafting;

  useEffect(() => {
    if (submitState.ok) {
      window.scrollTo({ top: 0 });
      router.refresh();
    }
  }, [submitState.ok, router]);
  useEffect(() => {
    if (refreshState.ok) router.refresh();
  }, [refreshState.ok, router]);

  async function draftWithAi() {
    setDrafting(true);
    setAiError(null);
    const fd = new FormData();
    fd.set("visit_id", visit.id);
    const res = await aiDraftReg73(IDLE_STATE, fd);
    setDrafting(false);
    if (res.error || !res.ok) {
      setAiError(res.error ?? "Could not draft.");
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
      setAiError("Could not read the AI draft. Try again.");
    }
  }

  const error = submitState.error || saveState.error || refreshState.error || aiError;

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
                      ) : (
                        "Not signed"
                      )
                    ) : f.type === "checkbox" ? (
                      val(f.key) === "Yes" ? "Confirmed" : "Not confirmed"
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
    <form className="space-y-4">
      <input type="hidden" name="visit_id" value={visit.id} />
      <input type="hidden" name="_ai_fields" value={[...gold].join(",")} />

      <div className="glass-card flex flex-wrap items-center gap-2 p-3">
        <button type="submit" formAction={saveAction} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {savePending ? "Saving…" : "Save draft"}
        </button>
        <button type="submit" formAction={refreshAction} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {refreshPending ? "Refreshing…" : "Refresh data"}
        </button>
        <button type="button" onClick={draftWithAi} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {drafting ? "Drafting…" : "Draft narrative with AI"}
        </button>
        <button type="submit" formAction={submitAction} disabled={busy} className="btn-primary ml-auto px-4 py-2 text-xs">
          {submitPending ? "Submitting…" : "Save and submit"}
        </button>
        {saveState.ok ? <span className="w-full text-xs text-emerald-300">{saveState.ok}</span> : null}
        {refreshState.ok ? <span className="w-full text-xs text-emerald-300">{refreshState.ok}</span> : null}
        {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
      </div>

      {REG73_SECTIONS.map((section) => (
        <div key={section.title} className="glass-card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
            {section.intro ? <p className="mt-1 text-xs text-white/45">{section.intro}</p> : null}
          </div>
          {section.fields.map((f) => {
            const id = `f_${f.key}`;
            const isAi = REG73_AI_FIELDS.includes(f.key);
            const isGold = gold.has(f.key);
            return (
              <div key={f.key}>
                <label htmlFor={id} className="form-label flex items-center gap-2">
                  {f.label}
                  {f.ai ? (
                    <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold text-gold-300">AI</span>
                  ) : null}
                </label>
                {f.type === "yesno" ? (
                  <select id={id} name={f.key} defaultValue={val(f.key)} className="mt-1 max-w-[8rem]">
                    <option value="">Not answered</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                ) : f.type === "checkbox" ? (
                  <label className="mt-1 flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" name={f.key} value="Yes" defaultChecked={val(f.key) === "Yes"} />
                    Tick to confirm
                  </label>
                ) : f.type === "date" ? (
                  <input id={id} name={f.key} type="date" defaultValue={val(f.key).slice(0, 10)} className="mt-1 max-w-[12rem]" />
                ) : f.type === "signature" ? (
                  <SignaturePad name={f.key} defaultValue={val(f.key)} />
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
      ))}

      <p className="text-xs text-white/40">
        The KPI, previous actions and complaints boxes are pre-filled from the site. Refresh data
        re-pulls them. Draft narrative with AI fills the tagged boxes in gold for you to edit. Tick
        the confirmation and save and submit to lock the visit.
      </p>
    </form>
  );
}

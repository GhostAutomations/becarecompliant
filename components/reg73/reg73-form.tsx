"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { REG73_SECTIONS, type Reg73Field } from "@/lib/reg73/spec";
import { saveReg73, submitReg73, aiDraftReg73 } from "@/lib/reg73/actions";
import type { Reg73VisitFull } from "@/lib/reg73/data";
import SignaturePad from "@/components/reg73/signature-pad";

function fmtDate(v: string): string {
  if (!v) return "Not answered";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

function EditField({ field, value }: { field: Reg73Field; value: string }) {
  const id = `f_${field.key}`;
  return (
    <div>
      <label htmlFor={id} className="form-label flex items-center gap-2">
        {field.label}
        {field.ai ? (
          <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold text-gold-300">AI</span>
        ) : null}
      </label>
      {field.type === "yesno" ? (
        <select id={id} name={field.key} defaultValue={value} className="mt-1 max-w-[8rem]">
          <option value="">Not answered</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : field.type === "date" ? (
        <input id={id} name={field.key} type="date" defaultValue={value.slice(0, 10)} className="mt-1 max-w-[12rem]" />
      ) : field.type === "signature" ? (
        <SignaturePad name={field.key} defaultValue={value} />
      ) : (
        <textarea id={id} name={field.key} defaultValue={value} rows={3} className="mt-1 w-full" />
      )}
      {field.hint ? <p className="form-hint">{field.hint}</p> : null}
    </div>
  );
}

export default function Reg73Form({
  visit,
  branchName,
  canEdit,
}: {
  visit: Reg73VisitFull;
  branchName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const data = (visit.data ?? {}) as Record<string, string>;
  const val = (k: string) => (typeof data[k] === "string" ? data[k] : "");

  const [saveState, saveAction, savePending] = useActionState(saveReg73, IDLE_STATE);
  const [aiState, aiAction, aiPending] = useActionState(aiDraftReg73, IDLE_STATE);
  const [submitState, submitAction, submitPending] = useActionState(submitReg73, IDLE_STATE);
  const busy = savePending || aiPending || submitPending;

  useEffect(() => {
    if (submitState.redirectTo) {
      router.replace(submitState.redirectTo);
      router.refresh();
    }
  }, [submitState, router]);
  useEffect(() => {
    if (aiState.ok) router.refresh();
  }, [aiState.ok, router]);
  useEffect(() => {
    if (saveState.ok) router.refresh();
  }, [saveState.ok, router]);

  const error = submitState.error || aiState.error || saveState.error;

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
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-white/90">
                    {f.type === "signature" ? (
                      val(f.key).startsWith("data:image") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={val(f.key)} alt="Responsible Individual signature" className="mt-1 h-20 rounded bg-white p-1" />
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
    <form className="space-y-4">
      <input type="hidden" name="visit_id" value={visit.id} />

      <div className="glass-card sticky top-2 z-10 flex flex-wrap items-center gap-2 p-3">
        <button type="submit" formAction={saveAction} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {savePending ? "Saving…" : "Save draft"}
        </button>
        <button type="submit" formAction={aiAction} disabled={busy} className="btn-outline px-3 py-2 text-xs">
          {aiPending ? "Drafting…" : "Draft narrative with AI"}
        </button>
        <button type="submit" formAction={submitAction} disabled={busy} className="btn-primary ml-auto px-4 py-2 text-xs">
          {submitPending ? "Submitting…" : "Submit and sign"}
        </button>
        {saveState.ok ? <span className="w-full text-xs text-emerald-300">{saveState.ok}</span> : null}
        {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
      </div>

      {REG73_SECTIONS.map((section) => (
        <div key={section.title} className="glass-card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
            {section.intro ? <p className="mt-1 text-xs text-white/45">{section.intro}</p> : null}
          </div>
          {section.fields.map((f) => (
            <EditField key={f.key} field={f} value={val(f.key)} />
          ))}
        </div>
      ))}

      <p className="text-xs text-white/40">
        The KPI, previous actions and complaints boxes are pre-filled from the site. Draft narrative
        with AI, edit anything, then submit and sign. Submitted visits are locked and exportable as a
        PDF.
      </p>
    </form>
  );
}

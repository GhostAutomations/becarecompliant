"use client";

/**
 * Be Care Compliant — the regulator's notices from an inspection, recorded against their theme.
 *
 * An open Priority Action Notice makes its theme Action needed, which is CIW's own rule (see
 * migration 0306 and lib/framework/theme-status.ts). Marking one put right takes it off.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { addInspectionNotice, setInspectionNoticeResolved } from "@/lib/framework/notice-actions";
import { IDLE_STATE } from "@/lib/forms";

export type NoticeRow = {
  id: string;
  requirement_code: string;
  kind: "priority_action" | "area_for_improvement";
  regulation: string | null;
  description: string;
  issued_on: string;
  due_by: string | null;
  resolved_on: string | null;
};

const KIND_LABEL: Record<NoticeRow["kind"], string> = {
  priority_action: "Priority Action Notice",
  area_for_improvement: "Area for Improvement",
};

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export default function NoticesPanel({
  regulatorName,
  themes,
  notices,
}: {
  regulatorName: string;
  themes: Array<{ code: string; title: string }>;
  notices: NoticeRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addInspectionNotice, IDLE_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const titleOf = new Map(themes.map((t) => [t.code, t.title]));
  const open = notices.filter((n) => !n.resolved_on);
  const closed = notices.filter((n) => n.resolved_on);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAdding(false);
    }
  }, [state]);

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{regulatorName} notices</h2>
          <p className="mt-0.5 text-sm text-white/60">
            Priority Action Notices and Areas for Improvement from an inspection. An open Priority
            Action Notice means that theme must be rated Requires significant improvement, so it
            shows as Action needed until it is put right.
          </p>
        </div>
        {!adding ? (
          <button type="button" className="btn-outline text-sm" onClick={() => setAdding(true)}>
            Record a notice
          </button>
        ) : null}
      </div>

      {adding ? (
        <form ref={formRef} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="n_kind" className="form-label">Kind</label>
            <select id="n_kind" name="kind" required defaultValue="">
              <option value="" disabled>Choose</option>
              <option value="priority_action">Priority Action Notice</option>
              <option value="area_for_improvement">Area for Improvement</option>
            </select>
          </div>
          <div>
            <label htmlFor="n_theme" className="form-label">Theme</label>
            <select id="n_theme" name="requirement_code" required defaultValue="">
              <option value="" disabled>Choose</option>
              {themes.map((t) => (
                <option key={t.code} value={t.code}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="n_reg" className="form-label">Regulation</label>
            <input id="n_reg" name="regulation" type="text" placeholder="For example Regulation 36" />
          </div>
          <div>
            <label htmlFor="n_issued" className="form-label">Issued on</label>
            <input id="n_issued" name="issued_on" type="date" required defaultValue={todayIso()} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="n_desc" className="form-label">What it requires</label>
            <textarea id="n_desc" name="description" rows={3} required maxLength={4000} />
          </div>
          <div>
            <label htmlFor="n_due" className="form-label">To be put right by</label>
            <input id="n_due" name="due_by" type="date" />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary text-sm" disabled={pending}>
              {pending ? "Saving…" : "Save the notice"}
            </button>
            <button type="button" className="btn-outline text-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
            {state.error ? <p className="form-error">{state.error}</p> : null}
          </div>
        </form>
      ) : null}

      {notices.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">No notices recorded.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {[...open, ...closed].map((n) => (
            <li
              key={n.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                n.resolved_on
                  ? "border-white/10 bg-white/[0.03] text-white/50"
                  : n.kind === "priority_action"
                    ? "border-red-400/30 bg-red-500/[0.07] text-white/85"
                    : "border-amber-300/30 bg-amber-400/[0.06] text-white/85"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {KIND_LABEL[n.kind]} · {titleOf.get(n.requirement_code) ?? n.requirement_code}
                  {n.regulation ? <span className="font-normal text-white/50"> · {n.regulation}</span> : null}
                </span>
                <span className="text-xs text-white/50">
                  Issued {fmt(n.issued_on)}
                  {n.due_by ? ` · due ${fmt(n.due_by)}` : ""}
                  {n.resolved_on ? ` · put right ${fmt(n.resolved_on)}` : ""}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{n.description}</p>
              <form action={setInspectionNoticeResolved} className="mt-2">
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="resolved_on" value={n.resolved_on ? "" : todayIso()} />
                <button type="submit" className="text-xs font-semibold text-gold-300 hover:text-gold-200">
                  {n.resolved_on ? "Reopen" : "Mark as put right today"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

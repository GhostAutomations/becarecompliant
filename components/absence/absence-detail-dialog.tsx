"use client";

/**
 * Be Care Compliant — "View absence" dialog.
 * Lists a person's recorded absences; a Manager/Admin can change the LAST date of
 * a multi-day absence here (keeping it one occasion, not several, so editing does
 * not push someone toward a trigger). Portalled to body so a glass card's
 * backdrop-filter can never trap the overlay.
 *
 * Discounting (0328, Phil 2026-09-24): a Manager or above can discount an absence (it stays here,
 * struck through, with who, when and why, and stops counting) and count it again. Supervisors see
 * it and can still edit the last date.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { updateAbsenceEndDate } from "@/lib/absence/actions";
import { discountAbsences, restoreAbsence } from "@/lib/absence/discount-actions";
import { absenceCountState } from "@/lib/absence/discount";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { AbsenceEventRow } from "@/lib/absence/data";

function fmt(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** Runs a server action from a button, refreshing the page when it succeeds. */
function useRun(action: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const router = useRouter();
  const [state, run, pending] = useActionState(action, IDLE_STATE);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setSubmitting(false);
    if (state.ok) router.refresh();
  }, [state, router]);
  function go(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setSubmitting(true);
    setTimeout(() => run(fd), 0);
  }
  return { state, go, busy: submitting || pending };
}

function RowEditor({
  ev,
  n,
  canEdit,
  canDiscount,
  windowStart,
}: {
  ev: AbsenceEventRow;
  n: number;
  canEdit: boolean;
  canDiscount: boolean;
  windowStart: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAbsenceEndDate, IDLE_STATE);
  const [end, setEnd] = useState(ev.end_date ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [saved, flash, reset] = useSavedFlash();
  const discount = useRun(discountAbsences);
  const restore = useRun(restoreAbsence);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setSubmitting(false);
    if (state.ok) {
      flash();
      router.refresh();
    }
  }, [state, flash, router]);

  useEffect(() => {
    if (discount.state.ok) {
      setAsking(false);
      setReason("");
    }
  }, [discount.state]);

  function save() {
    const fd = new FormData();
    fd.set("absence_id", ev.id);
    fd.set("end_date", end);
    setSubmitting(true);
    setTimeout(() => action(fd), 0);
  }

  const busy = submitting || pending;
  const countState = absenceCountState(ev, { windowStart });
  const discounted = countState === "discounted";

  return (
    <div className={`rounded-xl p-3 ${discounted ? "border border-white/10 bg-white/[0.02]" : "bg-white/5"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">Absence {n}</p>
        {discounted && <span className="pill pill-neutral">Discounted</span>}
        {countState === "outside_window" && <span className="pill pill-neutral">Outside the window</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="form-label text-[11px]">First date of absence</p>
          <p className={`text-sm ${discounted ? "text-white/45 line-through" : "text-white/85"}`}>{fmt(ev.start_date)}</p>
        </div>
        <div>
          <label className="form-label text-[11px]" htmlFor={`absence-end-${ev.id}`}>Last date of absence</label>
          <input
            id={`absence-end-${ev.id}`}
            type="date"
            value={end}
            disabled={!canEdit || busy}
            onChange={(e) => {
              setEnd(e.target.value);
              reset();
            }}
          />
        </div>
      </div>
      {ev.reason && <p className={`mt-2 text-xs ${discounted ? "text-white/40 line-through" : "text-white/60"}`}>{ev.reason}</p>}
      {discounted && (
        <p className="mt-2 text-xs text-white/70">
          Discounted by {ev.discounted_by_name ?? "a manager"} on {fmt(ev.discounted_at)}: {ev.discount_reason}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-white/45">{ev.days ?? 1} day{(ev.days ?? 1) === 1 ? "" : "s"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canDiscount && discounted && (
            <button
              type="button"
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={restore.busy}
              onClick={() => restore.go({ absence_id: ev.id })}
            >
              {restore.busy ? "Saving…" : "Count it again"}
            </button>
          )}
          {canDiscount && !discounted && !asking && (
            <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setAsking(true)}>
              Discount
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-1.5 text-xs`}
            >
              {busy ? "Saving…" : saved ? "Saved" : "Save last date"}
            </button>
          )}
        </div>
      </div>
      {asking && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/10 p-3">
          <label className="form-label text-[11px]" htmlFor={`discount-reason-${ev.id}`}>
            Why is this absence being discounted?
          </label>
          <textarea
            id={`discount-reason-${ev.id}`}
            rows={2}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: disallowed at the Stage 1 meeting, car broke down"
          />
          <p className="form-hint">
            It stays on the record, struck through, but stops counting towards the triggers. You can count it again later.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={discount.busy}
              onClick={() => discount.go({ absence_id: ev.id, reason })}
            >
              {discount.busy ? "Saving…" : "Discount absence"}
            </button>
          </div>
        </div>
      )}
      {state.error && <p className="form-error mt-1 text-xs">{state.error}</p>}
      {discount.state.error && <p className="form-error mt-1 text-xs">{discount.state.error}</p>}
      {restore.state.error && <p className="form-error mt-1 text-xs">{restore.state.error}</p>}
    </div>
  );
}

export default function AbsenceDetailDialog({
  personName,
  events,
  canEdit,
  canDiscount = false,
  windowStart,
  openOnMount = false,
  triggerLabel = "View absence",
  triggerClassName = "btn-outline px-3 py-1.5 text-xs",
}: {
  personName: string;
  events: AbsenceEventRow[];
  canEdit: boolean;
  /** Managers and above: discount and count again. */
  canDiscount?: boolean;
  /** First date inside the rolling window, to label absences that have aged out. */
  windowStart: string;
  /** Open straight away: a dashboard "Add last date" row asked for this person. */
  openOnMount?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Absences for {personName}</h2>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-white/60">No absences recorded.</p>
            ) : (
              <div className="space-y-3">
                {[...events]
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((ev, i) => (
                    <RowEditor
                      key={ev.id}
                      ev={ev}
                      n={i + 1}
                      canEdit={canEdit}
                      canDiscount={canDiscount}
                      windowStart={windowStart}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

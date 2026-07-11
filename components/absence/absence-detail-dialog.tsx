"use client";

/**
 * Be Care Compliant — "View absence" dialog.
 * Lists a person's recorded absences; a Manager/Admin can change the LAST date of
 * a multi-day absence here (keeping it one occasion, not several, so editing does
 * not push someone toward a trigger). Portalled to body so a glass card's
 * backdrop-filter can never trap the overlay.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { updateAbsenceEndDate } from "@/lib/absence/actions";
import type { AbsenceEventRow } from "@/lib/absence/data";

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function RowEditor({ ev, n, canEdit }: { ev: AbsenceEventRow; n: number; canEdit: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateAbsenceEndDate, IDLE_STATE);
  const [end, setEnd] = useState(ev.end_date ?? "");
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
    if (state.ok) {
      setDirty(false);
      router.refresh();
    }
  }, [state, router]);

  function save() {
    const fd = new FormData();
    fd.set("absence_id", ev.id);
    fd.set("end_date", end);
    setSubmitting(true);
    setTimeout(() => action(fd), 0);
  }

  const busy = submitting || pending;

  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold-300">
        Absence {n}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="form-label text-[11px]">First date of absence</p>
          <p className="text-sm text-white/85">{fmt(ev.start_date)}</p>
        </div>
        <div>
          <label className="form-label text-[11px]">Last date of absence</label>
          <input
            type="date"
            value={end}
            disabled={!canEdit || busy}
            onChange={(e) => {
              setEnd(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>
      {ev.reason && <p className="mt-2 text-xs text-white/60">{ev.reason}</p>}
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[11px] text-white/45">{ev.days ?? 1} day{(ev.days ?? 1) === 1 ? "" : "s"}</span>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-primary ml-auto px-3 py-1.5 text-xs"
          >
            {busy ? "Saving…" : state.ok && !dirty ? "Saved" : "Save last date"}
          </button>
        )}
      </div>
      {state.error && <p className="form-error mt-1 text-xs">{state.error}</p>}
    </div>
  );
}

export default function AbsenceDetailDialog({
  personName,
  events,
  canEdit,
  triggerLabel = "View absence",
  triggerClassName = "btn-outline px-3 py-1.5 text-xs",
}: {
  personName: string;
  events: AbsenceEventRow[];
  canEdit: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Absences — {personName}</h2>
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
                    <RowEditor key={ev.id} ev={ev} n={i + 1} canEdit={canEdit} />
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

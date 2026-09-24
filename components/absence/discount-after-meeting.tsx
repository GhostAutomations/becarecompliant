"use client";

/**
 * Be Care Compliant — "Did this meeting discount any absences?" (0328, Phil 2026-09-24: "Offer it
 * after a meeting").
 *
 * Opens straight after a meeting is recorded, for a Manager or above. Lists the absences that
 * count today with a tick box each; nothing is ticked to begin with, because most meetings
 * discount nothing. The reason is filled in from the meeting and can be changed. Skip closes it
 * and changes nothing.
 */

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { discountAbsences } from "@/lib/absence/discount-actions";
import type { AbsenceEventRow } from "@/lib/absence/data";

function fmt(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function DiscountAfterMeeting({
  personName,
  absences,
  defaultReason,
  onClose,
}: {
  personName: string;
  /** The absences that count today, oldest first. */
  absences: AbsenceEventRow[];
  defaultReason: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, run, pending] = useActionState(discountAbsences, IDLE_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState(defaultReason);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setSubmitting(false);
    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  const chosen = absences.filter((a) => ticked[a.id]).map((a) => a.id);
  const busy = submitting || pending;

  function save() {
    const fd = new FormData();
    for (const id of chosen) fd.append("absence_id", id);
    fd.set("reason", reason);
    setSubmitting(true);
    setTimeout(() => run(fd), 0);
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Discount absences for ${personName}`}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white">Meeting saved. Did it discount any absences?</h2>
        <p className="mt-1 text-sm text-white/60">
          Tick any absence for {personName} the meeting agreed not to count. It stays on the record, struck through,
          and stops counting towards the triggers.
        </p>

        {absences.length === 0 ? (
          <p className="mt-4 text-sm text-white/60">No absences count at the moment, so there is nothing to discount.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {absences.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
                <input
                  type="checkbox"
                  checked={!!ticked[a.id]}
                  onChange={(e) => setTicked((t) => ({ ...t, [a.id]: e.target.checked }))}
                />
                <span className="min-w-0 text-sm text-white/85">
                  {fmt(a.start_date)}
                  {a.end_date && a.end_date !== a.start_date ? ` to ${fmt(a.end_date)}` : ""}
                  {a.reason ? <span className="block text-xs text-white/55">{a.reason}</span> : null}
                </span>
              </label>
            ))}
          </div>
        )}

        {chosen.length > 0 && (
          <div className="mt-4">
            <label className="form-label" htmlFor="after-meeting-reason">Reason</label>
            <textarea
              id="after-meeting-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}

        {state.error && <p className="form-error mt-2">{state.error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={onClose} disabled={busy}>
            {chosen.length > 0 ? "Cancel" : "No, nothing was discounted"}
          </button>
          {chosen.length > 0 && (
            <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : chosen.length === 1 ? "Discount 1 absence" : `Discount ${chosen.length} absences`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

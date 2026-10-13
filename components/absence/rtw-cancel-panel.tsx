"use client";

/**
 * Cancel one or several Return to Works with one reason (0459, Phil 2026-10-13). Managers and
 * above; the database checks the role and the branch again. The reason and the ticks stay put if
 * the save is refused.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { cancelReturnToWorks } from "@/lib/absence/rtw-cancel-actions";

export default function RtwCancelPanel({
  ids,
  onDone,
  onBack,
}: {
  ids: string[];
  /** Called with the confirmation once the cancel has been saved. */
  onDone: (message: string) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [state, run, pending] = useActionState(cancelReturnToWorks, IDLE_STATE);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
    if (state.ok) {
      onDone(typeof state.ok === "string" ? state.ok : "Cancelled.");
      router.refresh();
    }
    // onDone is the parent's setter wrapper; only a new result should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  function go() {
    const fd = new FormData();
    for (const id of ids) fd.append("absence_id", id);
    fd.set("reason", reason);
    setSubmitting(true);
    setTimeout(() => run(fd), 0);
  }

  const busy = submitting || pending;
  const many = ids.length !== 1;
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <label htmlFor="rtw-cancel-reason" className="form-label text-[11px]">
        Why {many ? `are these ${ids.length} Return to Works` : "is this Return to Work"} being cancelled?
      </label>
      <textarea
        id="rtw-cancel-reason"
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: backlog from before we used the system"
      />
      <p className="form-hint">
        A cancelled Return to Work is kept on the absence with who, when and why, and leaves every
        list of outstanding ones. A Manager can reinstate it from View absence. Any questions sent to
        the employee are closed.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.error ? <p className="form-error mr-auto text-xs">{state.error}</p> : null}
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={go} disabled={busy || ids.length === 0}>
          {busy ? "Saving…" : many ? `Cancel ${ids.length} Return to Works` : "Cancel the Return to Work"}
        </button>
      </div>
    </div>
  );
}

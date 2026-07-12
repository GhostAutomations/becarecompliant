"use client";

/**
 * Be Care Compliant — cancel a booked absence meeting (Phase 6). Asks for
 * confirmation, then deletes the open booking and emails the invitees that
 * the meeting is off. Rebooking is booking again.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { cancelAbsenceMeetingBooking } from "@/lib/absence/actions";

export default function CancelBookingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(cancelAbsenceMeetingBooking, IDLE_STATE);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this meeting? The invitees will be emailed that it is off.")) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="meeting_id" value={meetingId} />
      <button type="submit" className="btn-ghost text-[11px]" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel booking"}
      </button>
      {state.error && <span className="ml-2 text-[11px] text-red-300">{state.error}</span>}
    </form>
  );
}

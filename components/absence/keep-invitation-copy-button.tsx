"use client";

/**
 * Make the kept copy of an invitation letter for a meeting booked before copies were kept (0406,
 * Phil 2026-10-06: Sarah Harris's Stage 2 invitation). Sends nothing; the copy is marked as made
 * afterwards. Once it exists the meeting line shows "Invitation letter PDF" instead.
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { keepMissingInvitationCopy } from "@/lib/absence/actions";

export default function KeepInvitationCopyButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(keepMissingInvitationCopy, IDLE_STATE);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <button type="submit" className="btn-outline px-2.5 py-1 text-[11px]" disabled={pending}>
        {pending ? "Making the copy…" : "Keep a copy of the invitation letter"}
      </button>
      {state.error ? <span className="text-red-300">{state.error}</span> : null}
      {state.ok ? <span className="text-emerald-300">{state.ok}</span> : null}
    </form>
  );
}

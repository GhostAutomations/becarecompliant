"use client";

/**
 * Be Care Compliant — public Accept / Decline form for an absence meeting
 * invitation. No login: the token is the capability. Accept is one click;
 * choosing Decline reveals a required reason box. Solid primary buttons and a
 * visible working state (standing rules).
 */

import { useActionState, useState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { respondToMeeting } from "@/lib/absence/response-actions";

export default function MeetingResponseForm({
  token,
  initialIntent,
}: {
  token: string;
  /** From the email button that was clicked: "accept" or "decline". */
  initialIntent?: string;
}) {
  const [state, action, pending] = useActionState(respondToMeeting, IDLE_STATE);
  const [declining, setDeclining] = useState(initialIntent === "decline");

  if (state.ok) {
    return <p className="text-sm text-emerald-300">{state.ok}</p>;
  }

  return (
    <div className="space-y-4">
      {!declining ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={action}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="response" value="accepted" />
            <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={pending}>
              {pending ? "Confirming…" : "Accept the invitation"}
            </button>
          </form>
          <button
            type="button"
            className="btn-outline px-5 py-2.5 text-sm"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            I cannot attend
          </button>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="response" value="declined" />
          <div>
            <label htmlFor="decline-reason" className="form-label">
              Please tell us why you cannot attend
            </label>
            <textarea
              id="decline-reason"
              name="reason"
              rows={4}
              required
              maxLength={2000}
              disabled={pending}
              placeholder="Your reason"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={pending}>
              {pending ? "Sending…" : "Send my response"}
            </button>
            <button
              type="button"
              className="btn-ghost px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => setDeclining(false)}
            >
              Back
            </button>
          </div>
        </form>
      )}
      {state.error && <p className="form-error">{state.error}</p>}
    </div>
  );
}

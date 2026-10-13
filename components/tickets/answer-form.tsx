"use client";

/**
 * The founder's answer to a ticket: the reply and the status side by side, saved by ONE press
 * that sends ONE email saying both (Phil, 2026-10-13). Leave the words empty to change only the
 * status (one short email); leave the status as it is to send only the reply.
 *
 * The words stay if the save is refused, and clear once it has gone.
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { answerTicket } from "@/lib/tickets/actions";
import { IDLE_STATE } from "@/lib/forms";
import { TICKET_STATUSES, statusOf } from "@/lib/tickets/options";

export default function TicketAnswerForm({ ticketId, status }: { ticketId: string; status: string }) {
  const [state, action] = useActionState(answerTicket, IDLE_STATE);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [next, setNext] = useState(status);
  // After a save the page shows the new status; the picker follows it.
  useEffect(() => setNext(status), [status]);
  useEffect(() => {
    if (state.ok) setBody("");
  }, [state]);

  const hasReply = body.trim().length > 0;
  const changes = next !== status;
  const label = hasReply ? (changes ? `Send reply, set ${statusOf(next).label}` : "Send reply") : "Save status";

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("ticket_id", ticketId);
        fd.set("body", body);
        fd.set("status", next);
        startTransition(() => action(fd));
      }}
    >
      <label htmlFor="t-answer" className="form-label">Reply</label>
      <textarea
        id="t-answer"
        rows={4}
        maxLength={5000}
        value={body}
        disabled={pending}
        placeholder="Your reply. They get one email with your reply and the status."
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="t-answer-status" className="form-label">Status</label>
          <select id="t-answer-status" value={next} disabled={pending} onChange={(e) => setNext(e.target.value)}>
            {TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={pending || (!hasReply && !changes)}>
          {pending ? "Sending…" : label}
        </button>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok && !pending ? <p className="text-sm text-emerald-300">{state.ok}</p> : null}
    </form>
  );
}

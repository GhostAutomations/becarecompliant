"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { replyToTicket } from "@/lib/tickets/actions";
import { IDLE_STATE } from "@/lib/forms";

/** Add a reply. The words stay if the reply is refused, and clear once it has gone. */
export default function TicketReplyForm({ ticketId, placeholder }: { ticketId: string; placeholder: string }) {
  const [state, action] = useActionState(replyToTicket, IDLE_STATE);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  useEffect(() => {
    if (state.ok) setBody("");
  }, [state]);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("ticket_id", ticketId);
        fd.set("body", body);
        startTransition(() => action(fd));
      }}
    >
      <label htmlFor="t-reply" className="form-label">Reply</label>
      <textarea
        id="t-reply"
        rows={4}
        maxLength={5000}
        value={body}
        disabled={pending}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
      />
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok && !pending ? <p className="text-sm text-emerald-300">{state.ok}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending || !body.trim()}>
        {pending ? "Sending…" : "Send reply"}
      </button>
    </form>
  );
}

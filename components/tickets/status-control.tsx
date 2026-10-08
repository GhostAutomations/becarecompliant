"use client";

import { useActionState, useState, useTransition } from "react";
import { setTicketStatus } from "@/lib/tickets/actions";
import { IDLE_STATE } from "@/lib/forms";
import { TICKET_STATUSES } from "@/lib/tickets/options";

/** The founder sets a ticket's status. Whoever raised it is emailed. */
export default function TicketStatusControl({ ticketId, status }: { ticketId: string; status: string }) {
  const [state, action] = useActionState(setTicketStatus, IDLE_STATE);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("ticket_id", ticketId);
        fd.set("status", value);
        startTransition(() => action(fd));
      }}
    >
      <div>
        <label htmlFor="t-status" className="form-label">Status</label>
        <select id="t-status" value={value} disabled={pending} onChange={(e) => setValue(e.target.value)}>
          {TICKET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-outline px-3 py-2 text-sm" disabled={pending || value === status}>
        {pending ? "Saving…" : "Save status"}
      </button>
      {state.error ? <p className="form-error w-full">{state.error}</p> : null}
      {state.ok && !pending ? <p className="w-full text-sm text-emerald-300">{state.ok}</p> : null}
    </form>
  );
}

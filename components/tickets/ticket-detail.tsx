import type { ReactNode } from "react";
import type { TicketMessage, TicketRow } from "@/lib/tickets/data";
import { FEATURE_ACK, kindLabel, ragOf, statusOf, ticketRef, ticketWhen, whereLabel } from "@/lib/tickets/options";
import TicketReplyForm from "@/components/tickets/reply-form";

/** One ticket: what was raised, the screenshots, and the replies (oldest at the top). */
export default function TicketDetail({
  ticket,
  messages,
  founder,
  aside,
}: {
  ticket: TicketRow;
  messages: TicketMessage[];
  founder: boolean;
  aside?: ReactNode;
}) {
  const rag = ragOf(ticket.rag);
  const status = statusOf(ticket.status);
  const where = whereLabel(ticket.department, ticket.area);
  return (
    <div className="space-y-4">
      <div className="glass-card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-white/50">
              {ticketRef(ticket.ticket_number)} · {kindLabel(ticket.kind)}
              {where ? ` · ${where}` : ""}
              {founder && ticket.company_name ? ` · ${ticket.company_name}` : ""}
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">{ticket.subject}</h1>
            <p className="mt-1 text-xs text-white/50">
              Raised by {ticket.raised_by_name}
              {founder && ticket.raised_by_email ? ` (${ticket.raised_by_email})` : ""} on {ticketWhen(ticket.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`pill ${rag.pill}`}>{rag.label}</span>
            <span className={`pill ${status.pill}`}>{status.label}</span>
          </div>
        </div>
        <p className="text-xs text-white/60">{rag.label}: {rag.meaning}</p>
        <p className="whitespace-pre-wrap text-sm text-white/90">{ticket.description}</p>
        {ticket.kind === "feature" && ticket.chargeable_ack ? (
          <p className="text-xs text-white/60">Acknowledged: {FEATURE_ACK}</p>
        ) : null}
        {ticket.screenshots.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {ticket.screenshots.map((s, i) => (
              <a
                key={s.path}
                href={`/api/tickets/${ticket.id}/file/${i}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-white/10"
                title={s.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/tickets/${ticket.id}/file/${i}`} alt={s.name} className="h-28 w-40 object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        {aside}
      </div>

      <div className="glass-card space-y-4 p-5">
        <h2 className="text-base font-semibold text-white">Replies</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-white/60">
            {founder ? "No replies yet." : "No replies yet. We will reply here, and email you when we do."}
          </p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl border p-3 ${m.from_founder ? "border-gold-400/30 bg-gold-400/10" : "border-white/10 bg-white/5"}`}
              >
                <p className="text-xs text-white/50">
                  {m.from_founder ? "Be Care Compliant" : m.author_name} · {ticketWhen(m.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
        <TicketReplyForm
          ticketId={ticket.id}
          placeholder={founder ? "Your reply. They are emailed when you send it." : "Add anything that helps, or answer a question we asked."}
        />
      </div>
    </div>
  );
}

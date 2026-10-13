import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getTicket } from "@/lib/tickets/data";
import { ticketWhen } from "@/lib/tickets/options";
import TicketDetail from "@/components/tickets/ticket-detail";
import TicketAnswerForm from "@/components/tickets/answer-form";
import TicketsLive from "@/components/tickets/tickets-live";

export const metadata: Metadata = { title: "Ticket" };

export default async function FounderTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const found = await getTicket(id);
  if (!found) notFound();
  const t = found.ticket;
  return (
    <div className="page-form space-y-4">
      <TicketsLive topic="founder" />
      <Link href="/founder/tickets" className="text-sm text-white/60 hover:text-white">← Back to Tickets</Link>
      <TicketDetail
        ticket={t}
        messages={found.messages}
        founder
        aside={
          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs text-white/60">
              {t.founder_texted_at
                ? `You were texted at ${ticketWhen(t.founder_texted_at)}.`
                : `You were not texted${t.founder_text_error ? `: ${t.founder_text_error}` : "."}`}
            </p>
          </div>
        }
        /* One press saves the reply and the status and sends one email (Phil, 2026-10-13). */
        answer={<TicketAnswerForm ticketId={t.id} status={t.status} />}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listTickets } from "@/lib/tickets/data";
import TicketSections from "@/components/tickets/ticket-sections";
import TicketsLive, { NewTicketToast } from "@/components/tickets/tickets-live";

export const metadata: Metadata = { title: "Tickets" };

export default async function FounderTicketsPage() {
  await requirePlatformAdmin();
  const rows = await listTickets(null);
  return (
    <div className="page-shell space-y-4">
      {/* Live (Phil, 2026-10-13): a new ticket, a status or a reply appears without a refresh. */}
      <TicketsLive topic="founder" />
      <NewTicketToast tickets={rows.map((t) => ({ id: t.id, company: t.company_name }))} />
      <Link href="/founder" className="text-sm text-white/60 hover:text-white">← Back to Founder console</Link>
      <div>
        <h1 className="page-title">Tickets</h1>
        <p className="page-subtitle">Problems and feature requests raised by companies, the one waiting longest at the top.</p>
      </div>
      {/* Two sections, three columns by rating, the same layout as every company's page (Phil, 2026-10-14). */}
      <TicketSections rows={rows} basePath="/founder/tickets" showCompany />
    </div>
  );
}

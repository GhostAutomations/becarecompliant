import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listTickets } from "@/lib/tickets/data";
import TicketList from "@/components/tickets/ticket-list";

export const metadata: Metadata = { title: "Tickets" };

export default async function FounderTicketsPage() {
  await requirePlatformAdmin();
  const rows = await listTickets(null);
  const open = rows.filter((t) => t.status !== "resolved");
  const resolved = rows.filter((t) => t.status === "resolved");
  return (
    <div className="page-shell space-y-4">
      <Link href="/founder" className="text-sm text-white/60 hover:text-white">← Back to Founder console</Link>
      <div>
        <h1 className="page-title">Tickets</h1>
        <p className="page-subtitle">Problems and feature requests raised by companies, newest first.</p>
      </div>
      <h2 className="text-base font-semibold text-white">Open and in progress ({open.length})</h2>
      <TicketList rows={open} basePath="/founder/tickets" showCompany empty="Nothing waiting." />
      <h2 className="text-base font-semibold text-white">Resolved ({resolved.length})</h2>
      <TicketList rows={resolved} basePath="/founder/tickets" showCompany empty="None resolved yet." />
    </div>
  );
}

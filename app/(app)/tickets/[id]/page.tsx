import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getTicket } from "@/lib/tickets/data";
import { TICKET_RAISER_ROLES } from "@/lib/tickets/options";
import TicketDetail from "@/components/tickets/ticket-detail";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await params;
  if (profile.role === "platform_admin") redirect(`/founder/tickets/${id}`);
  if (!TICKET_RAISER_ROLES.includes(profile.role)) redirect("/dashboard");
  const found = await getTicket(id);
  if (!found || found.ticket.company_id !== profile.company_id) notFound();

  return (
    <div className="page-form space-y-4">
      <Link href="/tickets" className="text-sm text-white/60 hover:text-white">← Back to Tickets</Link>
      <TicketDetail ticket={found.ticket} messages={found.messages} founder={false} />
    </div>
  );
}

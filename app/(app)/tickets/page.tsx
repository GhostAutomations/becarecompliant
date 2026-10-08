import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { listTickets } from "@/lib/tickets/data";
import { TICKET_RAISER_ROLES, TICKET_SEE_ALL_ROLES } from "@/lib/tickets/options";
import TicketList from "@/components/tickets/ticket-list";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder/tickets");
  const founder = profile.role === "platform_admin";
  if (!founder && !TICKET_RAISER_ROLES.includes(profile.role)) redirect("/dashboard");
  const rows = await listTickets(profile.company_id);
  const seesAll = founder || TICKET_SEE_ALL_ROLES.includes(profile.role);

  return (
    <div className="page-shell space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="page-subtitle">
            Report a problem or ask for a new feature, and follow our replies.{" "}
            {seesAll ? "Every ticket from your company is shown." : "The tickets you have raised are shown."}
          </p>
        </div>
        {!founder ? (
          <Link href="/tickets/new" className="btn-primary text-sm">Raise a ticket</Link>
        ) : null}
      </div>
      <TicketList
        rows={rows}
        basePath="/tickets"
        empty={founder ? "This company has not raised a ticket." : "No tickets yet. Raise one when something is not working, or for a feature you would like."}
      />
    </div>
  );
}

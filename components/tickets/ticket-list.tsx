import Link from "next/link";
import type { TicketRow } from "@/lib/tickets/data";
import { kindLabel, ragOf, statusOf, ticketRef, ticketWhen, whereLabel } from "@/lib/tickets/options";

/** Tickets as a calm list: newest first, rating and status as pills. Shared by the company's
 *  Tickets page and the founder's. */
export default function TicketList({
  rows,
  basePath,
  showCompany = false,
  empty,
}: {
  rows: TicketRow[];
  basePath: string;
  showCompany?: boolean;
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="glass-card p-6 text-sm text-white/60">{empty}</div>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const rag = ragOf(t.rag);
        const status = statusOf(t.status);
        const where = whereLabel(t.department, t.area);
        return (
          <li key={t.id}>
            <Link href={`${basePath}/${t.id}`} className="glass-card glass-card-hover block p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-white/50">
                    {ticketRef(t.ticket_number)} · {kindLabel(t.kind)}
                    {where ? ` · ${where}` : ""}
                    {showCompany && t.company_name ? ` · ${t.company_name}` : ""}
                  </p>
                  <p className="mt-1 truncate font-semibold text-white">{t.subject}</p>
                  <p className="mt-1 text-xs text-white/50">
                    Raised by {t.raised_by_name} on {ticketWhen(t.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`pill ${rag.pill}`}>{rag.label}</span>
                  <span className={`pill ${status.pill}`}>{status.label}</span>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

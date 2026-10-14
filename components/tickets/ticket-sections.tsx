import type { TicketRow } from "@/lib/tickets/data";
import { ragOf } from "@/lib/tickets/options";
import { SECTION_RAGS, ticketSections, type RagColumns } from "@/lib/tickets/sections";
import CollapsibleSection from "@/components/settings/collapsible-section";
import { TicketCard } from "@/components/tickets/ticket-list";

/**
 * Tickets in two sections, each in three columns by rating (Phil, 2026-10-14;
 * docs/decisions/tickets.md). ONE layout for the company's Tickets page and the Founder console's.
 *
 * "Open and in progress" is open, oldest at the top; "Resolved" starts folded with its count, the
 * newest resolved at the top (lib/tickets/sections.ts). Red, amber, green left to right; on a phone
 * the columns stack in the same order. In progress tickets carry their "In progress" pill.
 */
export default function TicketSections({
  rows,
  basePath,
  showCompany = false,
}: {
  rows: TicketRow[];
  basePath: string;
  showCompany?: boolean;
}) {
  const s = ticketSections(rows);
  return (
    <div className="space-y-4">
      <CollapsibleSection title={`Open and in progress · ${s.openCount}`} defaultOpen wide>
        <RagColumnsView cols={s.open} basePath={basePath} showCompany={showCompany} />
      </CollapsibleSection>
      <CollapsibleSection title={`Resolved · ${s.resolvedCount}`} wide>
        <RagColumnsView cols={s.resolved} basePath={basePath} showCompany={showCompany} />
      </CollapsibleSection>
    </div>
  );
}

function RagColumnsView({
  cols,
  basePath,
  showCompany,
}: {
  cols: RagColumns<TicketRow>;
  basePath: string;
  showCompany: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SECTION_RAGS.map((r) => {
        const rag = ragOf(r);
        const list = cols[r];
        return (
          <div key={r} className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className={`pill ${rag.pill}`}>{rag.label}</span>
              <span className="text-xs tabular-nums text-white/55">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p className="px-1 text-xs text-white/40">None</p>
            ) : (
              <ul className="space-y-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <TicketCard t={t} basePath={basePath} showCompany={showCompany} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

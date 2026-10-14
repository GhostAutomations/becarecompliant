/**
 * Tickets in two sections and three columns (Phil, 2026-10-14; docs/decisions/tickets.md).
 *
 * Pure and import free so node --test can load it. Shared by the company's Tickets page and the
 * Founder console's, through components/tickets/ticket-sections.tsx.
 *
 *  - "Open and in progress": status open or in_progress. Oldest raised first, so the one waiting
 *    longest is at the top and the newest at the bottom.
 *  - "Resolved": newest resolved first (resolved_at; a ticket with none falls back to its last
 *    change, then to when it was raised).
 * Inside each, three columns by rating: red, amber, green.
 */

export type SectionRag = "red" | "amber" | "green";
export const SECTION_RAGS: readonly SectionRag[] = ["red", "amber", "green"];

export type SectionTicket = {
  id: string;
  status: string;
  rag: string;
  created_at: string;
  updated_at?: string | null;
  resolved_at?: string | null;
};

export type RagColumns<T> = Record<SectionRag, T[]>;

const ragOf = (r: string): SectionRag => (r === "red" || r === "green" ? r : "amber");
const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

function columns<T extends SectionTicket>(rows: readonly T[]): RagColumns<T> {
  const out: RagColumns<T> = { red: [], amber: [], green: [] };
  for (const t of rows) out[ragOf(t.rag)].push(t);
  return out;
}

export function ticketSections<T extends SectionTicket>(
  rows: readonly T[],
): { open: RagColumns<T>; resolved: RagColumns<T>; openCount: number; resolvedCount: number } {
  const open = rows
    .filter((t) => t.status !== "resolved")
    .slice()
    .sort((a, b) => at(a.created_at) - at(b.created_at) || a.id.localeCompare(b.id));
  const resolvedWhen = (t: T) => at(t.resolved_at) || at(t.updated_at) || at(t.created_at);
  const resolved = rows
    .filter((t) => t.status === "resolved")
    .slice()
    .sort((a, b) => resolvedWhen(b) - resolvedWhen(a) || a.id.localeCompare(b.id));
  return {
    open: columns(open),
    resolved: columns(resolved),
    openCount: open.length,
    resolvedCount: resolved.length,
  };
}

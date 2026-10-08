import "server-only";

/**
 * Tickets: reading them. Through the caller's own client, so RLS decides what comes back
 * (can_see_support_ticket, 0432): the founder sees every ticket, a company's Admin and managers see
 * their company's, everyone else sees the ones they raised.
 */

import { createClient } from "@/lib/supabase/server";

export type TicketScreenshot = { path: string; name: string; type: string };

export type TicketRow = {
  id: string;
  ticket_number: number;
  company_id: string;
  company_name: string | null;
  raised_by: string | null;
  raised_by_name: string;
  raised_by_email: string | null;
  kind: string;
  department: string | null;
  area: string | null;
  subject: string;
  description: string;
  rag: string;
  chargeable_ack: boolean;
  status: string;
  screenshots: TicketScreenshot[];
  founder_texted_at: string | null;
  founder_text_error: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type TicketMessage = {
  id: string;
  author_name: string;
  from_founder: boolean;
  body: string;
  created_at: string;
};

const COLUMNS =
  "id, ticket_number, company_id, raised_by, raised_by_name, raised_by_email, kind, department, area, subject, description, rag, chargeable_ack, status, screenshots, founder_texted_at, founder_text_error, created_at, updated_at, resolved_at, companies(name)";

type Raw = Omit<TicketRow, "company_name" | "screenshots"> & {
  screenshots: unknown;
  companies: { name: string } | Array<{ name: string }> | null;
};

function shape(r: Raw): TicketRow {
  const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
  const shots = Array.isArray(r.screenshots) ? (r.screenshots as TicketScreenshot[]) : [];
  const { companies: _c, ...rest } = r;
  void _c;
  return { ...rest, company_name: c?.name ?? null, screenshots: shots };
}

/** Newest first. companyId narrows to one company (the company's own list); null is every company
 *  the caller may see (the founder's list). */
export async function listTickets(companyId: string | null): Promise<TicketRow[]> {
  const supabase = await createClient();
  let q = supabase.from("support_tickets").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q;
  return ((data as unknown as Raw[] | null) ?? []).map(shape);
}

export async function getTicket(id: string): Promise<{ ticket: TicketRow; messages: TicketMessage[] } | null> {
  const supabase = await createClient();
  const [{ data: t }, { data: m }] = await Promise.all([
    supabase.from("support_tickets").select(COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("support_ticket_messages")
      .select("id, author_name, from_founder, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (!t) return null;
  return { ticket: shape(t as unknown as Raw), messages: (m as TicketMessage[] | null) ?? [] };
}

/** Open and in progress tickets by rating, for the Founder console tile. */
export async function openTicketCounts(): Promise<{ red: number; amber: number; green: number; total: number }> {
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets").select("rag").neq("status", "resolved");
  const out = { red: 0, amber: 0, green: 0, total: 0 };
  for (const r of (data as Array<{ rag: string }> | null) ?? []) {
    if (r.rag === "red" || r.rag === "amber" || r.rag === "green") out[r.rag] += 1;
    out.total += 1;
  }
  return out;
}

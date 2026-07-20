import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_INVOICING_CONFIG,
  displayStatus,
  type InvoicingConfig,
  type InvoiceStatus,
} from "./types";

/** Today as YYYY-MM-DD in Europe/London (civil date), for overdue derivation. */
export function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export type Branch = { id: string; name: string };

/** Branches the caller can file invoicing against. Admins see all active company
 *  branches; branch managers see only their assigned branch(es). */
export async function listAccessibleBranches(
  companyId: string,
  role: string,
  userId: string,
): Promise<Branch[]> {
  const supabase = await createClient();
  let branchIds: string[] | null = null;
  if (role !== "company_admin" && role !== "platform_admin") {
    const { data: ubs } = await supabase
      .from("user_branches")
      .select("branch_id")
      .eq("user_id", userId);
    branchIds = ((ubs as Array<{ branch_id: string }> | null) ?? []).map((r) => r.branch_id);
    if (branchIds.length === 0) return [];
  }
  let query = supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("kind", "branch")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (branchIds) query = query.in("id", branchIds);
  const { data } = await query;
  return (data as Branch[]) ?? [];
}

export type ServiceUserLite = { id: string; name: string; branch_id: string };

/** Active service users the caller can see, for optionally linking to a client. */
export async function listAccessibleServiceUsers(companyId: string): Promise<ServiceUserLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select("id, full_name, branch_id, service_status")
    .eq("company_id", companyId)
    .eq("service_status", "active")
    .order("full_name", { ascending: true });
  return ((data as Array<{ id: string; full_name: string; branch_id: string }> | null) ?? []).map(
    (r) => ({ id: r.id, name: r.full_name, branch_id: r.branch_id }),
  );
}

export async function getInvoicingConfig(companyId: string): Promise<InvoicingConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoicing_config")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return { company_id: companyId, ...DEFAULT_INVOICING_CONFIG };
  return data as InvoicingConfig;
}

export type RateLine = {
  id: string;
  description: string;
  unit_price_pence: number;
  active: boolean;
  position: number;
};

export async function listRateList(companyId: string, activeOnly = false): Promise<RateLine[]> {
  const supabase = await createClient();
  let q = supabase
    .from("rate_list")
    .select("id, description, unit_price_pence, active, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data as RateLine[]) ?? [];
}

export type PrivateClient = {
  id: string;
  company_id: string;
  branch_id: string;
  client_type: "person" | "organisation";
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  service_user_id: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  status: "active" | "archived";
  branch_name?: string | null;
  service_user_name?: string | null;
};

export async function listPrivateClients(
  companyId: string,
  status: "active" | "archived" = "active",
): Promise<PrivateClient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("private_clients")
    .select("*, branches(name), service_users(full_name)")
    .eq("company_id", companyId)
    .eq("status", status)
    .order("name", { ascending: true });
  return ((data as Array<PrivateClient & {
    branches: { name: string } | null;
    service_users: { full_name: string } | null;
  }> | null) ?? []).map(({ branches, service_users, ...rest }) => ({
    ...rest,
    branch_name: branches?.name ?? null,
    service_user_name: service_users?.full_name ?? null,
  }));
}

export async function getPrivateClient(id: string): Promise<PrivateClient | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("private_clients")
    .select("*, branches(name), service_users(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { branches, service_users, ...rest } = data as PrivateClient & {
    branches: { name: string } | null;
    service_users: { full_name: string } | null;
  };
  return { ...rest, branch_name: branches?.name ?? null, service_user_name: service_users?.full_name ?? null };
}

export type InvoiceRow = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  total_pence: number;
  client_name: string;
  branch_name: string | null;
};

export async function listInvoices(companyId: string): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, status, issue_date, due_date, total_pence, created_at, private_clients(name), branches(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as Array<{
    id: string;
    number: string | null;
    status: InvoiceStatus;
    issue_date: string | null;
    due_date: string | null;
    total_pence: number;
    private_clients: { name: string } | null;
    branches: { name: string } | null;
  }> | null) ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    issue_date: r.issue_date,
    due_date: r.due_date,
    total_pence: r.total_pence,
    client_name: r.private_clients?.name ?? "Unknown client",
    branch_name: r.branches?.name ?? null,
  }));
}

export type InvoiceSummary = {
  outstandingPence: number; // sent + unpaid (incl overdue)
  overdueCount: number;
  overduePence: number;
  draftCount: number;
  paidThisMonthPence: number;
};

export async function getInvoiceSummary(companyId: string): Promise<InvoiceSummary> {
  const supabase = await createClient();
  const today = londonToday();
  const monthStart = today.slice(0, 8) + "01";
  const { data } = await supabase
    .from("invoices")
    .select("status, due_date, total_pence, paid_date")
    .eq("company_id", companyId);
  const rows = (data as Array<{
    status: InvoiceStatus;
    due_date: string | null;
    total_pence: number;
    paid_date: string | null;
  }> | null) ?? [];
  let outstandingPence = 0;
  let overdueCount = 0;
  let overduePence = 0;
  let draftCount = 0;
  let paidThisMonthPence = 0;
  for (const r of rows) {
    if (r.status === "draft") draftCount += 1;
    if (r.status === "sent") {
      outstandingPence += r.total_pence;
      if (displayStatus("sent", r.due_date, today) === "overdue") {
        overdueCount += 1;
        overduePence += r.total_pence;
      }
    }
    if (r.status === "paid" && r.paid_date && r.paid_date >= monthStart) {
      paidThisMonthPence += r.total_pence;
    }
  }
  return { outstandingPence, overdueCount, overduePence, draftCount, paidThisMonthPence };
}

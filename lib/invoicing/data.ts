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

const INVOICE_TO_LABEL: Record<string, string> = {
  service_user: "The service user",
  nhs: "NHS",
  solicitor: "Solicitor",
  next_of_kin: "Next of kin",
  other: "Other",
};

export type PrivateInvoicingClient = {
  id: string; // service_user_id
  name: string;
  branch_id: string;
  branch_name: string | null;
  invoice_to: string | null;
  invoice_to_label: string;
  invoice_contact_name: string | null;
  invoice_delivery: string | null;
  invoice_email: string | null;
  invoice_phone: string | null;
  invoice_address: string | null;
};

/** Service users flagged for private invoicing = the Invoicing department's clients. */
export async function listPrivateInvoicingClients(companyId: string): Promise<PrivateInvoicingClient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_users")
    .select(
      "id, full_name, branch_id, invoice_to, invoice_contact_name, invoice_delivery, invoice_email, invoice_phone, invoice_address, branches(name)",
    )
    .eq("company_id", companyId)
    .eq("private_invoicing", true)
    .eq("service_status", "active")
    .order("full_name", { ascending: true });
  return ((data as Array<{
    id: string;
    full_name: string;
    branch_id: string;
    invoice_to: string | null;
    invoice_contact_name: string | null;
    invoice_delivery: string | null;
    invoice_email: string | null;
    invoice_phone: string | null;
    invoice_address: string | null;
    branches: { name: string } | null;
  }> | null) ?? []).map((r) => ({
    id: r.id,
    name: r.full_name,
    branch_id: r.branch_id,
    branch_name: r.branches?.name ?? null,
    invoice_to: r.invoice_to,
    invoice_to_label: INVOICE_TO_LABEL[r.invoice_to ?? "service_user"] ?? "The service user",
    invoice_contact_name: r.invoice_contact_name,
    invoice_delivery: r.invoice_delivery,
    invoice_email: r.invoice_email,
    invoice_phone: r.invoice_phone,
    invoice_address: r.invoice_address,
  }));
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
    .select("id, number, status, issue_date, due_date, total_pence, bill_to_name, created_at, service_users(full_name), branches(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as Array<{
    id: string;
    number: string | null;
    status: InvoiceStatus;
    issue_date: string | null;
    due_date: string | null;
    total_pence: number;
    bill_to_name: string | null;
    service_users: { full_name: string } | null;
    branches: { name: string } | null;
  }> | null) ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    issue_date: r.issue_date,
    due_date: r.due_date,
    total_pence: r.total_pence,
    client_name: r.service_users?.full_name ?? r.bill_to_name ?? "Unknown client",
    branch_name: r.branches?.name ?? null,
  }));
}

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
  vat_rate: number;
  position: number;
};

export type InvoiceDetail = {
  id: string;
  company_id: string;
  branch_id: string;
  service_user_id: string | null;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  supply_period_start: string | null;
  supply_period_end: string | null;
  subtotal_pence: number;
  vat_pence: number;
  total_pence: number;
  vat_applied: boolean;
  vat_number_snapshot: string | null;
  invoice_to: string | null;
  bill_to_name: string | null;
  bill_to_address: string | null;
  bill_to_email: string | null;
  bill_to_phone: string | null;
  delivery_method: string | null;
  notes: string | null;
  paid_date: string | null;
  paid_method: string | null;
  client_name: string;
  lines: InvoiceLine[];
};

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("*, service_users(full_name), invoice_lines(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as InvoiceDetail & {
    service_users: { full_name: string } | null;
    invoice_lines: InvoiceLine[];
  };
  const lines = (row.invoice_lines ?? []).slice().sort((a, b) => a.position - b.position);
  return {
    ...row,
    client_name: row.service_users?.full_name ?? row.bill_to_name ?? "Unknown client",
    lines,
  };
}

/** Company display name, for the invoice header and PDF. */
export async function getCompanyName(companyId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  return (data?.name as string) ?? "Your company";
}

export type ScheduleRow = {
  id: string;
  client_name: string;
  frequency: string;
  interval_count: number;
  next_run_date: string;
};

export async function listSchedules(companyId: string): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_schedules")
    .select("id, frequency, interval_count, next_run_date, service_users(full_name)")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("next_run_date", { ascending: true });
  return ((data as Array<{
    id: string;
    frequency: string;
    interval_count: number;
    next_run_date: string;
    service_users: { full_name: string } | null;
  }> | null) ?? []).map((r) => ({
    id: r.id,
    client_name: r.service_users?.full_name ?? "Unknown client",
    frequency: r.frequency,
    interval_count: r.interval_count,
    next_run_date: r.next_run_date,
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

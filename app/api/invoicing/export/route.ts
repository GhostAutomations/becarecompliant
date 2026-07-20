import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { buildCsv } from "@/lib/export/csv";
import { listInvoices, londonToday } from "@/lib/invoicing/data";
import { displayStatus, STATUS_LABEL, formatMoney } from "@/lib/invoicing/types";

/** CSV of the invoice list for the company. Pro gated, Manager+ via RLS. */
export async function GET(_req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return new Response("No company", { status: 403 });
  if (!(await featureEnabled(profile.company_id, "invoicing"))) {
    return new Response("Invoicing is a Pro feature.", { status: 403 });
  }

  const [invoices] = await Promise.all([listInvoices(profile.company_id)]);
  const today = londonToday();
  const csv = buildCsv(
    ["Number", "Client", "Branch", "Issued", "Due", "Status", "Total"],
    invoices.map((inv) => [
      inv.number ?? "Draft",
      inv.client_name,
      inv.branch_name ?? "",
      inv.issue_date ?? "",
      inv.due_date ?? "",
      STATUS_LABEL[displayStatus(inv.status, inv.due_date, today)],
      formatMoney(inv.total_pence),
    ]),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

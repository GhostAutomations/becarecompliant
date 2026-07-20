import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { getInvoice, getInvoicingConfig, londonToday } from "@/lib/invoicing/data";
import { updateInvoice } from "@/lib/invoicing/invoice-actions";
import { INVOICE_SERVICES, serviceRatePence, serviceFixedPence } from "@/lib/invoicing/types";
import InvoiceBuilder from "@/components/invoicing/invoice-builder";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { companyId } = await requireInvoicing();
  const inv = await getInvoice(id);
  if (!inv || inv.company_id !== companyId) redirect("/invoicing");
  if (inv.status !== "draft") redirect(`/invoicing/${id}`);
  const config = await getInvoicingConfig(companyId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/invoicing/${id}`} label="Back to invoice" />
      <h1 className="page-title">Edit draft invoice</h1>
      <InvoiceBuilder
        mode="edit"
        action={updateInvoice}
        clients={[]}
        services={INVOICE_SERVICES.map((s) => ({
          label: s.label,
          hourly_pence: serviceRatePence(config, s.key),
          fixed_pence: serviceFixedPence(config, s.key),
        }))}
        vatEnabled={config.vat_enabled}
        today={londonToday()}
        initial={{
          invoice_id: inv.id,
          service_user_id: inv.service_user_id,
          client_name: inv.client_name,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          supply_period_start: inv.supply_period_start,
          supply_period_end: inv.supply_period_end,
          notes: inv.notes,
          lines: inv.lines.map((l) => ({
            service: l.service,
            unit_label: l.unit_label,
            handed: l.handed,
            quantity: l.quantity,
          })),
        }}
      />
    </div>
  );
}

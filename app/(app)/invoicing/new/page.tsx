import type { Metadata } from "next";
import { requireInvoicing } from "@/lib/invoicing/guard";
import {
  listPrivateInvoicingClients,
  listRateList,
  getInvoicingConfig,
  londonToday,
} from "@/lib/invoicing/data";
import { createInvoice } from "@/lib/invoicing/invoice-actions";
import { serviceTemplates } from "@/lib/invoicing/types";
import InvoiceBuilder from "@/components/invoicing/invoice-builder";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { companyId } = await requireInvoicing();
  const [clients, rates, config] = await Promise.all([
    listPrivateInvoicingClients(companyId),
    listRateList(companyId, true),
    getInvoicingConfig(companyId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />
      <h1 className="page-title">New invoice</h1>
      <InvoiceBuilder
        mode="create"
        action={createInvoice}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          invoice_to_label: c.invoice_to_label,
          invoice_delivery: c.invoice_delivery,
        }))}
        presets={[
          ...serviceTemplates(config),
          ...rates.map((r) => ({ description: r.description, unit_price_pence: r.unit_price_pence })),
        ]}
        vatEnabled={config.vat_enabled}
        today={londonToday()}
      />
    </div>
  );
}

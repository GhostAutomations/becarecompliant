import type { Metadata } from "next";
import { requireInvoicing } from "@/lib/invoicing/guard";
import {
  listPrivateInvoicingClients,
  getInvoicingConfig,
  londonToday,
} from "@/lib/invoicing/data";
import { createInvoice } from "@/lib/invoicing/invoice-actions";
import { INVOICE_SERVICES, serviceRatePence, serviceFixedPence } from "@/lib/invoicing/types";
import InvoiceBuilder from "@/components/invoicing/invoice-builder";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const { companyId } = await requireInvoicing();
  const [clients, config] = await Promise.all([
    listPrivateInvoicingClients(companyId),
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
        services={INVOICE_SERVICES.map((s) => ({
          label: s.label,
          hourly_pence: serviceRatePence(config, s.key),
          fixed_pence: serviceFixedPence(config, s.key),
        }))}
        vatEnabled={config.vat_enabled}
        today={londonToday()}
      />
    </div>
  );
}

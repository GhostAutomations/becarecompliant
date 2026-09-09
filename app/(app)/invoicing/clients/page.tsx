import type { Metadata } from "next";
import Link from "next/link";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { listPrivateInvoicingClients } from "@/lib/invoicing/data";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Private Clients" };

export default async function PrivateClientsPage() {
  const { companyId } = await requireInvoicing();
  const clients = await listPrivateInvoicingClients(companyId);

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />
      <div>
        <h1 className="page-title">Private Clients</h1>
        {/* Reworded 2026-09-09: private invoicing is no longer asked when a service user is
            added. It is switched on by the Setup Visit's funding answer, so the page has to
            say where these came from rather than send people to a tick box that has gone. */}
        <p className="page-subtitle">
          Service users you invoice yourselves. They arrive here when a Setup Visit is completed
          with a funding type your company invoices directly, and you can switch it on by hand
          on any service user record.
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No private clients yet. They appear here on their own once a Setup Visit is
            completed with a funding type you invoice directly — set which those are in
            Settings, Service Users, Funding options. You can also switch it on by hand on a
            service user record.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href="/settings/service-users" className="btn-outline inline-block text-sm">
              Funding options
            </Link>
            <Link href="/service-users" className="btn-ghost inline-block text-sm">
              Go to Service Users
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/service-users/${c.id}`}
              className="glass-card flex items-center justify-between gap-3 p-4 text-left transition hover:bg-white/15"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{c.name}</p>
                <p className="text-xs text-white/50">
                  {c.branch_name} · invoice to {c.invoice_to_label.toLowerCase()}
                  {c.invoice_delivery ? ` · by ${c.invoice_delivery}` : ""}
                </p>
              </div>
              <span className="text-xs text-white/40">{c.invoice_email ?? c.invoice_phone ?? ""}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

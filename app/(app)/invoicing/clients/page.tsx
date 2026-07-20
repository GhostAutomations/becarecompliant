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
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />
      <div>
        <h1 className="page-title">Private Clients</h1>
        <p className="page-subtitle">
          Service users with private invoicing switched on. Turn it on when adding or editing a
          service user.
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No private invoicing clients yet. Open a Service User, edit their details and tick
            Private invoicing.
          </p>
          <Link href="/service-users" className="btn-outline mt-4 inline-block text-sm">
            Go to Service Users
          </Link>
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

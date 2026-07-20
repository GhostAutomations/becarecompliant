import type { Metadata } from "next";
import Link from "next/link";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { listPrivateClients } from "@/lib/invoicing/data";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Private Clients" };

export default async function PrivateClientsPage() {
  const { companyId } = await requireInvoicing();
  const clients = await listPrivateClients(companyId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Private Clients</h1>
          <p className="page-subtitle">The payers you invoice for privately funded care.</p>
        </div>
        <Link href="/invoicing/clients/new" className="btn-primary text-sm">Add client</Link>
      </div>

      {clients.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No private clients yet. Add one to start raising invoices.
          </p>
          <Link href="/invoicing/clients/new" className="btn-outline mt-4 inline-block text-sm">
            Add your first client
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/invoicing/clients/${c.id}`}
              className="app-tile flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{c.name}</p>
                <p className="text-xs text-white/50">
                  {c.client_type === "organisation" ? "Organisation" : "Person"} · {c.branch_name}
                  {c.service_user_name ? ` · for ${c.service_user_name}` : ""}
                </p>
              </div>
              <span className="text-xs text-white/40">{c.email ?? c.phone ?? ""}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

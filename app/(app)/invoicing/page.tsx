import type { Metadata } from "next";
import Link from "next/link";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { getInvoiceSummary, listInvoices, londonToday } from "@/lib/invoicing/data";
import {
  formatMoney,
  displayStatus,
  STATUS_PILL,
  STATUS_LABEL,
} from "@/lib/invoicing/types";

export const metadata: Metadata = { title: "Invoicing" };

export default async function InvoicingPage() {
  const { companyId } = await requireInvoicing();
  const [summary, invoices] = await Promise.all([
    getInvoiceSummary(companyId),
    listInvoices(companyId),
  ]);
  const today = londonToday();

  const cards = [
    { label: "Outstanding", value: formatMoney(summary.outstandingPence), tone: "text-white" },
    {
      label: "Overdue",
      value: `${summary.overdueCount} · ${formatMoney(summary.overduePence)}`,
      tone: summary.overdueCount > 0 ? "text-red-300" : "text-white",
    },
    { label: "Drafts", value: String(summary.draftCount), tone: "text-white" },
    { label: "Paid this month", value: formatMoney(summary.paidThisMonthPence), tone: "text-emerald-300" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Invoicing</h1>
          <p className="page-subtitle">Private client invoices for your branches.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/invoicing/schedules" className="btn-outline text-sm">Recurring</Link>
          <Link href="/invoicing/clients" className="btn-outline text-sm">Private Clients</Link>
          <Link href="/invoicing/new" className="btn-primary text-sm">New invoice</Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-white/45">{c.label}</p>
            <p className={`mt-2 text-2xl font-bold ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/80">Invoices</h2>
          {invoices.length > 0 ? (
            <a href="/api/invoicing/export" className="btn-ghost text-xs">Export CSV</a>
          ) : null}
        </div>
        {invoices.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <p className="text-sm text-white/60">
              No invoices yet. Add your private clients, then raise an invoice from a client.
            </p>
            <Link href="/invoicing/clients" className="btn-outline mt-4 inline-block text-sm">
              Go to Private Clients
            </Link>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const ds = displayStatus(inv.status, inv.due_date, today);
                  return (
                    <tr key={inv.id} className="border-t border-white/10">
                      <td className="py-2 pr-3">
                        <Link href={`/invoicing/${inv.id}`} className="text-gold-300 hover:underline">
                          {inv.number ?? "Draft"}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-white/85">{inv.client_name}</td>
                      <td className="py-2 pr-3 text-white/60">{inv.branch_name}</td>
                      <td className="py-2 pr-3 text-white/60">{inv.issue_date ?? "—"}</td>
                      <td className="py-2 pr-3 text-white/60">{inv.due_date ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-white/90">
                        {formatMoney(inv.total_pence)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`pill ${STATUS_PILL[ds]}`}>{STATUS_LABEL[ds]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

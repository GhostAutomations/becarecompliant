import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import BackLink from "@/components/back-link";
import { invoiceLabel, matchesFilter, type InvoiceFilter } from "@/lib/billing/invoice-status";

/**
 * Founder > Invoices (Phil, 2026-09-30): every invoice Stripe has issued, across every company,
 * in one place. Monthly and Annual subscriptions, invoices sent for bank transfer, and credit top
 * ups all appear, because Stripe issues them all. Read only: it never writes to Stripe.
 *
 * Read live from Stripe rather than copied into our database, so it can never disagree with
 * what the customer was actually sent. The newest 100 are shown.
 */

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: InvoiceFilter; label: string }> = [
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
];

const money = (pence: number) =>
  `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";

export default async function FounderInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requirePlatformAdmin();
  const { show } = await searchParams;
  const filter: InvoiceFilter = FILTERS.some((f) => f.key === show) ? (show as InvoiceFilter) : "unpaid";

  const header = (
    <div>
      <BackLink href="/founder" label="Back to Founder console" />
      <h1 className="page-title mt-1">Invoices</h1>
      <p className="page-subtitle">Every invoice Stripe has sent, for every company: subscriptions, Annual invoices and top ups.</p>
    </div>
  );

  const stripe = getStripe();
  if (!stripeConfigured() || !stripe) {
    return (
      <div className="space-y-6">
        {header}
        <p className="glass-card p-5 text-sm text-white/70">Stripe is not configured, so there are no invoices to show.</p>
      </div>
    );
  }

  // Which company each Stripe customer belongs to.
  const supabase = createServiceClient();
  const { data: billingRows } = await supabase
    .from("company_billing")
    .select("company_id, stripe_customer_id, companies(name)")
    .not("stripe_customer_id", "is", null);
  const companyByCustomer = new Map<string, string>();
  for (const r of (billingRows as Array<{ stripe_customer_id: string; companies: { name: string } | { name: string }[] | null }> | null) ?? []) {
    const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    companyByCustomer.set(r.stripe_customer_id, c?.name ?? "Unknown company");
  }

  let error: string | null = null;
  let invoices: Array<{
    id: string;
    number: string | null;
    company: string;
    created: number;
    due: number | null;
    total: number;
    remaining: number;
    label: ReturnType<typeof invoiceLabel>;
    pdf: string | null;
    url: string | null;
  }> = [];
  try {
    const now = Date.now();
    /* BE CARE COMPLIANT'S OWN CUSTOMERS ONLY (DEF-085, 2026-09-30). One Stripe account holds
       Join Care Now and Carer Academy too, so the account-wide list showed their customers'
       invoices here as if they were ours, and could push ours past the 100 limit. Asked per
       customer on a company_billing row instead, newest first across all of them. */
    const lists = await Promise.all(
      [...companyByCustomer.keys()].map((customer) => stripe.invoices.list({ customer, limit: 100 })),
    );
    const ours = lists.flatMap((l) => l.data).sort((a, b) => b.created - a.created);
    invoices = ours.map((inv) => {
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? "";
      return {
        id: inv.id ?? "",
        number: inv.number ?? null,
        company: companyByCustomer.get(customer) ?? inv.customer_name ?? inv.customer_email ?? "Unknown company",
        created: inv.created,
        due: inv.due_date ?? null,
        total: inv.total ?? 0,
        remaining: inv.amount_remaining ?? 0,
        label: invoiceLabel({ status: inv.status, dueDate: inv.due_date, nowMs: now }),
        pdf: inv.invoice_pdf ?? null,
        url: inv.hosted_invoice_url ?? null,
      };
    });
  } catch (e) {
    console.error("[founder invoices] list failed:", (e as Error).message);
    error = "Stripe could not be read just now. Try again in a moment.";
  }

  const shown = invoices.filter((i) => matchesFilter(i.label.label, filter));
  const outstanding = invoices
    .filter((i) => i.label.label === "Due" || i.label.label === "Overdue")
    .reduce((s, i) => s + i.remaining, 0);
  const overdue = invoices.filter((i) => i.label.label === "Overdue");

  return (
    <div className="space-y-6">
      {header}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs text-white/55">Waiting to be paid</p>
          <p className="mt-1 text-xl text-white">{money(outstanding)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-white/55">Overdue</p>
          <p className="mt-1 text-xl text-white">
            {overdue.length} {overdue.length === 1 ? "invoice" : "invoices"}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-white/55">Shown</p>
          <p className="mt-1 text-xl text-white">Newest {invoices.length}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/founder/invoices?show=${f.key}`}
            className={f.key === filter ? "pill pill-green" : "pill pill-neutral"}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <section className="glass-card p-5">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-white/60">
            {filter === "unpaid" ? "Nothing waiting to be paid." : filter === "overdue" ? "Nothing overdue." : "No invoices yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/50">
                <tr>
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Due</th>
                  <th className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                {shown.map((i) => (
                  <tr key={i.id} className="border-t border-white/5">
                    <td className="py-2 pr-4">{i.company}</td>
                    <td className="py-2 pr-4 text-white/60">{i.number ?? "Draft"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{day(i.created)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{day(i.due) || "Card"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(i.total)}</td>
                    <td className="py-2 pr-4">
                      <span className={`pill ${i.label.pill}`}>{i.label.label}</span>
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      {i.url ? (
                        <a href={i.url} target="_blank" rel="noreferrer" className="text-gold-300 underline underline-offset-4">
                          View
                        </a>
                      ) : null}
                      {i.pdf ? (
                        <a href={i.pdf} target="_blank" rel="noreferrer" className="ml-3 text-gold-300 underline underline-offset-4">
                          PDF
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

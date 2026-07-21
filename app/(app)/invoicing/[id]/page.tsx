import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { getInvoice, getInvoicingConfig, getCompanyName, londonToday } from "@/lib/invoicing/data";
import { sendInvoice, markInvoicePaid, deleteInvoice, resendInvoiceEmail } from "@/lib/invoicing/invoice-actions";
import { formatMoney, displayStatus, STATUS_PILL, STATUS_LABEL } from "@/lib/invoicing/types";
import ActionForm from "@/components/action-form";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Invoice" };

const INVOICE_TO_LABEL: Record<string, string> = {
  service_user: "the service user",
  nhs: "NHS",
  solicitor: "solicitor",
  next_of_kin: "next of kin",
  other: "other",
};

function fmtDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { companyId } = await requireInvoicing();
  const inv = await getInvoice(id);
  if (!inv || inv.company_id !== companyId) redirect("/invoicing");
  const [config, companyName] = await Promise.all([
    getInvoicingConfig(companyId),
    getCompanyName(companyId),
  ]);
  const today = londonToday();
  const ds = displayStatus(inv.status, inv.due_date, today);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{inv.number ?? "Draft invoice"}</h1>
            <span className={`pill ${STATUS_PILL[ds]}`}>{STATUS_LABEL[ds]}</span>
          </div>
          <p className="page-subtitle">{inv.client_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inv.status !== "draft" && inv.delivery_method === "email" ? (
            <ActionForm
              action={resendInvoiceEmail}
              hidden={{ invoice_id: inv.id }}
              label="Resend"
              savedLabel="Sent"
              buttonClassName="btn-primary text-xs"
              confirm="Resend this invoice to the client by email?"
              className=""
            />
          ) : null}
          <a href={`/api/invoicing/${inv.id}/pdf`} target="_blank" rel="noopener" className="btn-outline text-xs">
            Download PDF
          </a>
          {inv.status === "draft" ? (
            <>
              <Link href={`/invoicing/${inv.id}/edit`} className="btn-outline text-xs">Edit</Link>
              <ActionForm action={sendInvoice} hidden={{ invoice_id: inv.id }} label="Send" savedLabel="Sent" buttonClassName="btn-primary text-xs" confirm="Send this invoice? It will be given its invoice number, and emailed to the client if they receive invoices by email." className="" />
            </>
          ) : null}
          <ActionForm action={deleteInvoice} hidden={{ invoice_id: inv.id }} label="Delete" buttonClassName="btn-outline text-xs" confirm="Delete this invoice and all record of it? This cannot be undone." className="" />
        </div>
      </div>

      {/* Mark paid */}
      {inv.status === "sent" ? (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">Record a payment</h2>
          <ActionForm action={markInvoicePaid} label="Mark paid" buttonClassName="btn-primary text-xs" className="mt-3 space-y-4">
            <input type="hidden" name="invoice_id" value={inv.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="paid_date" className="form-label">Date paid</label>
                <input id="paid_date" name="paid_date" type="date" defaultValue={today} />
              </div>
              <div>
                <label htmlFor="paid_method" className="form-label">Method (optional)</label>
                <input id="paid_method" name="paid_method" placeholder="Bank transfer, card, cash" />
              </div>
            </div>
          </ActionForm>
        </section>
      ) : null}

      {/* Bill to + dates */}
      <section className="glass-card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-white/45">Bill to</h2>
          <p className="mt-1 text-sm font-semibold text-white">{inv.bill_to_name ?? inv.client_name}</p>
          <p className="text-xs text-white/50">Invoice to {INVOICE_TO_LABEL[inv.invoice_to ?? "service_user"]}</p>
          {inv.bill_to_address ? <p className="mt-1 whitespace-pre-line text-sm text-white/70">{inv.bill_to_address}</p> : null}
          {inv.bill_to_email ? <p className="text-sm text-white/70">{inv.bill_to_email}</p> : null}
          {inv.bill_to_phone ? <p className="text-sm text-white/70">{inv.bill_to_phone}</p> : null}
          {inv.delivery_method ? <p className="mt-1 text-xs text-white/45">Sent by {inv.delivery_method}</p> : null}
        </div>
        <div className="space-y-1 text-sm text-white/70">
          <div className="text-right">
            <p className="text-sm font-semibold text-white">{companyName}</p>
            {config.from_address ? <p className="whitespace-pre-line text-xs text-white/55">{config.from_address}</p> : null}
          </div>
          <div className="flex justify-between"><span className="text-white/45">Issued</span><span>{inv.issue_date ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-white/45">Due</span><span>{inv.due_date ?? "—"}</span></div>
          {inv.supply_period_start || inv.supply_period_end ? (
            <div className="flex justify-between">
              <span className="text-white/45">Service period</span>
              <span>{inv.supply_period_start ?? "…"} to {inv.supply_period_end ?? "…"}</span>
            </div>
          ) : null}
          {inv.status === "paid" ? (
            <div className="flex justify-between"><span className="text-white/45">Paid</span><span>{inv.paid_date}{inv.paid_method ? ` (${inv.paid_method})` : ""}</span></div>
          ) : null}
        </div>
      </section>

      {/* Lines */}
      <section className="glass-card p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-white/45">
              <th className="py-2 pr-3">Service</th>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Handed</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => {
              const prev = inv.lines[i - 1];
              const weekKey = `${l.period_start ?? ""}|${l.period_end ?? ""}`;
              const prevKey = prev ? `${prev.period_start ?? ""}|${prev.period_end ?? ""}` : null;
              const showWeek = l.period_start && l.period_end && weekKey !== prevKey;
              return (
                <Fragment key={l.id}>
                  {showWeek ? (
                    <tr>
                      <td colSpan={5} className="border-t border-dashed border-gold-400/40 pt-3 pb-1 text-xs font-medium text-gold-300">
                        Week: {fmtDate(l.period_start)} to {fmtDate(l.period_end)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-t border-white/10">
                    <td className="py-2 pr-3 text-white/85">{l.service ?? l.description}</td>
                    <td className="py-2 pr-3 text-white/70">{l.unit_label ?? "—"}</td>
                    <td className="py-2 pr-3 text-white/70">{l.handed === "double" ? "Double" : l.handed === "single" ? "Single" : "—"}</td>
                    <td className="py-2 pr-3 text-right text-white/70">{l.quantity}</td>
                    <td className="py-2 text-right text-white/90">{formatMoney(l.line_total_pence)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between text-white/70"><span>Subtotal</span><span>{formatMoney(inv.subtotal_pence)}</span></div>
          {inv.vat_applied ? (
            <div className="flex justify-between text-white/70">
              <span>VAT{inv.vat_number_snapshot ? ` (${inv.vat_number_snapshot})` : ""}</span>
              <span>{formatMoney(inv.vat_pence)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold text-white"><span>Total</span><span>{formatMoney(inv.total_pence)}</span></div>
        </div>
      </section>

      {(inv.notes || config.payment_details || config.invoice_footer) ? (
        <section className="glass-card space-y-3 p-5 text-sm text-white/70">
          {inv.notes ? <p className="whitespace-pre-line">{inv.notes}</p> : null}
          {config.payment_details ? (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-white/45">Payment details</h3>
              <p className="mt-1 whitespace-pre-line">{config.payment_details}</p>
            </div>
          ) : null}
          {config.invoice_footer ? <p className="text-xs text-white/45">{config.invoice_footer}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

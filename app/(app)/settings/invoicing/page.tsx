import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { getInvoicingConfig, listRateList } from "@/lib/invoicing/data";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { saveInvoicingConfig, addRateLine, deleteRateLine, saveHourlyRates, saveCompanyLogo } from "@/lib/invoicing/actions";
import { formatMoney, INVOICE_SERVICES, serviceRatePence, serviceFixedPence } from "@/lib/invoicing/types";

export const metadata: Metadata = { title: "Invoicing settings" };

export default async function InvoicingSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  if (!(await featureEnabled(profile.company_id, "invoicing"))) redirect("/settings");

  const [config, rates, logoUrl] = await Promise.all([
    getInvoicingConfig(profile.company_id),
    listRateList(profile.company_id),
    getCompanyLogoDataUrl(profile.company_id),
  ]);
  const canEditStart = profile.role === "platform_admin" || Boolean(profile.actingAsCompanyId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Invoicing</h1>
        <p className="page-subtitle">
          VAT, bank details, invoice numbering, reminders and your reusable rate list.
        </p>
      </div>

      {/* Company logo */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Company logo</h2>
        <p className="form-hint mt-1">Shown at the top of every invoice and its PDF. PNG or JPG, under 2MB.</p>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Company logo" className="mt-3 max-h-16 rounded bg-white/90 p-2" />
        ) : null}
        <div className="mt-4">
          <ActionForm action={saveCompanyLogo} label="Upload logo">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
            />
          </ActionForm>
        </div>
      </section>

      {/* Configuration */}
      <section className="glass-card p-5">
        <ActionForm action={saveInvoicingConfig} label="Save">
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="vat_enabled" defaultChecked={config.vat_enabled} />
                Charge VAT on invoices
              </label>
              <p className="form-hint">
                Most regulated personal care is VAT exempt. Only tick this if your company is VAT
                registered. With no VAT number, no VAT is charged.
              </p>
            </div>
            <div>
              <label htmlFor="vat_number" className="form-label">VAT number</label>
              <input
                id="vat_number"
                name="vat_number"
                defaultValue={config.vat_number ?? ""}
                placeholder="GB123456789"
                className="max-w-[16rem]"
              />
              <p className="form-hint">Required when VAT is ticked. Shown on every VAT invoice.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="number_prefix" className="form-label">Invoice number prefix</label>
                <input
                  id="number_prefix"
                  name="number_prefix"
                  defaultValue={config.number_prefix}
                  maxLength={12}
                  className="max-w-[10rem]"
                />
                <p className="form-hint">e.g. {config.number_prefix}00042</p>
              </div>
              <div>
                <label htmlFor="number_start" className="form-label">Start number</label>
                <input
                  id="number_start"
                  name="number_start"
                  type="number"
                  min={1}
                  defaultValue={config.number_start}
                  disabled={!canEditStart}
                  className="max-w-[8rem]"
                />
                <p className="form-hint">
                  {canEditStart
                    ? "The first invoice number. Locked once invoices exist."
                    : "System controlled so numbering stays sequential."}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="default_payment_terms_days" className="form-label">Payment terms</label>
              <input
                id="default_payment_terms_days"
                name="default_payment_terms_days"
                type="number"
                min={0}
                defaultValue={config.default_payment_terms_days}
                className="max-w-[8rem]"
              />
              <p className="form-hint">Days until an invoice is due, from its issue date.</p>
            </div>

            <div>
              <label htmlFor="payment_details" className="form-label">Bank / payment details</label>
              <textarea
                id="payment_details"
                name="payment_details"
                rows={3}
                defaultValue={config.payment_details ?? ""}
                placeholder={"Account name: Your Company Ltd\nSort code: 00-00-00\nAccount number: 12345678"}
              />
              <p className="form-hint">Shown on every invoice so clients can pay by bank transfer.</p>
            </div>

            <div>
              <label htmlFor="company_number" className="form-label">Company number (optional)</label>
              <input
                id="company_number"
                name="company_number"
                defaultValue={config.company_number ?? ""}
                placeholder="e.g. 12345678"
              />
              <p className="form-hint">Your Companies House number. When set, it is shown in the invoice footer.</p>
            </div>

            <div>
              <label htmlFor="reply_to_email" className="form-label">Reply to email (optional)</label>
              <input
                id="reply_to_email"
                name="reply_to_email"
                type="email"
                defaultValue={config.reply_to_email ?? ""}
                placeholder="e.g. accounts@yourcompany.co.uk"
              />
              <p className="form-hint">Invoice emails are sent by Be Care Compliant, but when a client hits Reply it goes to this address, your own inbox. Without it, replies go to an unmonitored address.</p>
            </div>

            <div>
              <label htmlFor="invoice_footer" className="form-label">Invoice footer (optional)</label>
              <textarea
                id="invoice_footer"
                name="invoice_footer"
                rows={2}
                defaultValue={config.invoice_footer ?? ""}
                placeholder="Thank you for your business. Terms: payment due within 14 days."
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                name="overdue_reminders_enabled"
                defaultChecked={config.overdue_reminders_enabled}
              />
              Send automatic email reminders for overdue invoices
            </label>
          </div>
        </ActionForm>
      </section>

      {/* Rate list */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Rate list</h2>
        <p className="form-hint mt-1">
          Saved lines you can drop onto an invoice with one click. Edit prices any time.
        </p>

        {/* Rates */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white/80">Rates</h3>
          <p className="form-hint mt-1">
            Set an hourly rate and, if you use one, a fixed rate (a flat fee for the whole visit)
            per service. Double handed hourly lines are charged at twice the rate automatically.
          </p>
          <ActionForm action={saveHourlyRates} label="Save rates" className="mt-3 space-y-3">
            <div className="grid grid-cols-[1fr_8rem_8rem] items-center gap-x-3 gap-y-2">
              <span className="text-xs uppercase tracking-wide text-white/45">Service</span>
              <span className="text-center text-xs uppercase tracking-wide text-white/45">Hourly rate</span>
              <span className="text-center text-xs uppercase tracking-wide text-white/45">Fixed rate</span>
              {INVOICE_SERVICES.map((s) => (
                <div key={s.key} className="contents">
                  <label htmlFor={`rate_${s.key}`} className="text-sm text-white/85">{s.label}</label>
                  <input
                    id={`rate_${s.key}`}
                    name={`rate_${s.key}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    defaultValue={(serviceRatePence(config, s.key) / 100 || 0).toFixed(2)}
                  />
                  <input
                    id={`rate_${s.key}_fixed`}
                    name={`rate_${s.key}_fixed`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    defaultValue={(serviceFixedPence(config, s.key) / 100 || 0).toFixed(2)}
                  />
                </div>
              ))}
            </div>
          </ActionForm>
        </div>

        <div className="mt-4 space-y-2">
          {rates.length === 0 ? (
            <p className="text-sm text-white/50">No saved rates yet. Add your first below.</p>
          ) : (
            rates.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-white/85">{r.description}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white/90">
                    {formatMoney(r.unit_price_pence)}
                  </span>
                  <ActionForm
                    action={deleteRateLine}
                    hidden={{ id: r.id }}
                    label="Remove"
                    buttonClassName="btn-ghost text-xs"
                    confirm="Remove this rate?"
                    className=""
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <ActionForm action={addRateLine} label="Add rate">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div>
                <label htmlFor="rate_description" className="form-label">Description</label>
                <input id="rate_description" name="description" placeholder="Care visit, per hour" />
              </div>
              <div>
                <label htmlFor="rate_price" className="form-label">Unit price (£)</label>
                <input id="rate_price" name="unit_price" type="text" inputMode="decimal" placeholder="25.00" />
              </div>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}

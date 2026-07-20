"use client";

import { useState } from "react";

export type PrivateInvoicingInitial = {
  private_invoicing?: boolean;
  invoice_to?: string | null;
  invoice_contact_name?: string | null;
  invoice_address?: string | null;
  invoice_phone?: string | null;
  invoice_email?: string | null;
  invoice_delivery?: string | null;
};

/**
 * Private invoicing details for a Service User. The client is always the service
 * user, but the invoice bill-to can be the service user, the NHS, a solicitor or
 * next of kin, reached by email or post. Shown on the Add and Edit forms.
 */
export default function PrivateInvoicingFields({ initial }: { initial?: PrivateInvoicingInitial }) {
  const [on, setOn] = useState<boolean>(initial?.private_invoicing ?? false);
  const [delivery, setDelivery] = useState<string>(initial?.invoice_delivery ?? "email");

  return (
    <div className="sm:col-span-2 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <label className="flex items-center gap-2 text-sm font-medium text-white/90">
        <input
          type="checkbox"
          name="private_invoicing"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        Private invoicing
      </label>
      <p className="form-hint -mt-2">
        Turn this on for a privately funded service user you raise invoices for.
      </p>

      {on ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invoice_to" className="form-label">Send the invoice to</label>
            <select id="invoice_to" name="invoice_to" defaultValue={initial?.invoice_to ?? "service_user"}>
              <option value="service_user">The service user</option>
              <option value="nhs">NHS</option>
              <option value="solicitor">Solicitor</option>
              <option value="next_of_kin">Next of kin</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="invoice_contact_name" className="form-label">Bill to name</label>
            <input
              id="invoice_contact_name"
              name="invoice_contact_name"
              defaultValue={initial?.invoice_contact_name ?? ""}
              placeholder="Who the invoice is addressed to"
            />
          </div>

          <div>
            <label htmlFor="invoice_delivery" className="form-label">How to invoice</label>
            <select
              id="invoice_delivery"
              name="invoice_delivery"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              className="max-w-[12rem]"
            >
              <option value="email">By email</option>
              <option value="post">By post</option>
            </select>
          </div>
          <div>
            <label htmlFor="invoice_email" className="form-label">
              Email{delivery === "email" ? " *" : ""}
            </label>
            <input
              id="invoice_email"
              name="invoice_email"
              type="email"
              defaultValue={initial?.invoice_email ?? ""}
              required={delivery === "email"}
            />
          </div>

          <div>
            <label htmlFor="invoice_phone" className="form-label">Phone</label>
            <input id="invoice_phone" name="invoice_phone" defaultValue={initial?.invoice_phone ?? ""} />
          </div>
          <div>
            <label htmlFor="invoice_address" className="form-label">
              Address{delivery === "post" ? " *" : ""}
            </label>
            <textarea
              id="invoice_address"
              name="invoice_address"
              rows={2}
              defaultValue={initial?.invoice_address ?? ""}
              required={delivery === "post"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

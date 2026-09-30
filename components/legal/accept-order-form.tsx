"use client";

import { useEffect, useRef, useState } from "react";
import ActionForm from "@/components/action-form";
import { acceptAgreement } from "@/lib/legal/accept-actions";
import { ORGANISATION_TYPES } from "@/lib/legal/fill";

/**
 * The Order fields and the tick on the accept screen (/agreement).
 *
 * CONTROLLED, ON PURPOSE (DEF-082, found testing A4 on 2026-09-30). React resets an uncontrolled
 * form after its action runs, so when the server refused (no company number) the address the Admin
 * had typed and the tick were wiped, and everything had to be entered again. Held in state here,
 * a refusal leaves every answer where it was. The company or charity number is also marked
 * required in the browser for a limited company or a charity, so the commonest refusal is caught
 * before anything is sent. The server still checks everything (checkOrder).
 *
 * THE TICK AND THE CHOICES TOO (retest of A4, 2026-09-30). Being controlled kept the typed text,
 * but React 19 resets the form itself after the action, and that reset unticked the box and put
 * the radios and the select back to their first option on screen while the state still said
 * otherwise. So when the form resets, every choice is put back from state straight after.
 */
export default function AcceptOrderForm({
  initial,
  footer,
  billingApplies = true,
}: {
  initial: { legalName: string; companyNumber: string; address: string };
  footer: React.ReactNode;
  /** False for a Black account: never billed, so Monthly or Annual is not asked (Phil,
   *  2026-09-30). The server decides the same from the plan, whatever this form sends. */
  billingApplies?: boolean;
}) {
  const [legalName, setLegalName] = useState(initial.legalName);
  const [orgType, setOrgType] = useState("limited_company");
  const [companyNumber, setCompanyNumber] = useState(initial.companyNumber);
  const [address, setAddress] = useState(initial.address);
  const [billing, setBilling] = useState("monthly");
  const [accepted, setAccepted] = useState(false);
  const numberRequired = orgType === "limited_company" || orgType === "charity";

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ orgType, billing, accepted });
  latest.current = { orgType, billing, accepted };
  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setTimeout(() => {
        const v = latest.current;
        const sel = form.querySelector<HTMLSelectElement>("#organisation_type");
        if (sel) sel.value = v.orgType;
        form.querySelectorAll<HTMLInputElement>('input[name="billing_option"]').forEach((r) => {
          r.checked = r.value === v.billing;
        });
        const box = form.querySelector<HTMLInputElement>('input[name="accept"]');
        if (box) box.checked = v.accepted;
      }, 0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <ActionForm
      action={acceptAgreement}
      label="Accept"
      savingLabel="Accepting…"
      savedLabel="Accepted"
      buttonClassName="btn-primary text-sm"
      className="mt-5 space-y-4"
    >
      <div ref={anchorRef} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="legal_name" className="form-label">
            Customer legal name
          </label>
          <input
            id="legal_name"
            name="legal_name"
            required
            maxLength={200}
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="organisation_type" className="form-label">
            Type of organisation
          </label>
          <select
            id="organisation_type"
            name="organisation_type"
            required
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
          >
            {ORGANISATION_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="company_number" className="form-label">
            {orgType === "charity" ? "Charity number" : "Company or charity number"}
            {numberRequired ? "" : " (if any)"}
          </label>
          <input
            id="company_number"
            name="company_number"
            maxLength={40}
            required={numberRequired}
            value={companyNumber}
            onChange={(e) => setCompanyNumber(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="form-label">
            Registered or main address
          </label>
          <textarea
            id="address"
            name="address"
            required
            rows={3}
            maxLength={500}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      </div>

      {billingApplies ? (
        <fieldset>
          <legend className="form-label">Billing option</legend>
          <div className="mt-1 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="radio"
                name="billing_option"
                value="monthly"
                checked={billing === "monthly"}
                onChange={() => setBilling("monthly")}
              />
              Monthly, card, cancel any time
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="radio"
                name="billing_option"
                value="annual"
                checked={billing === "annual"}
                onChange={() => setBilling("annual")}
              />
              Annual, invoiced yearly in advance
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="billing_option" value="none" />
      )}

      {footer}

      <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/85">
        <input
          type="checkbox"
          name="accept"
          value="yes"
          required
          className="mt-0.5"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          I have read the Subscription Agreement and the Data Processing Agreement, I accept them on behalf of the
          company named above, and I am authorised to do so.
        </span>
      </label>
    </ActionForm>
  );
}

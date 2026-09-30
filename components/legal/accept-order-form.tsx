"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ActionForm from "@/components/action-form";
import LegalDocumentView from "@/components/legal/legal-document-view";
import { acceptAgreement } from "@/lib/legal/accept-actions";
import {
  MAX_EXTRA_BRANCHES,
  MAX_EXTRA_USERS,
  ORGANISATION_TYPES,
  extrasLineText,
  extrasPaidText,
  fillOrderTable,
  money,
  orderCosts,
  orderTableValues,
} from "@/lib/legal/fill";

/**
 * The accept screen's form (/agreement): the Order, both agreements, the tick and Accept.
 *
 * ORDER FIRST, AND THE AGREEMENT FILLS IN (Phil, 2026-09-30, by popup, after testing the Pro Order
 * on his phone). The Order sits at the top; the Subscription Agreement below it ends with the Order
 * table, and that table fills in live from what is typed and chosen here (fillOrderTable), so the
 * agreement read is the agreement accepted. The tick and Accept come last, after both agreements.
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

export type OrderSummary = {
  plan: string;
  tier: string;
  /** What the plan includes, as short points for the screen. */
  includedList: string[];
  /** Users and branches (not counting the office team) the plan includes, and each extra's price. */
  usersIncluded: number;
  branchesIncluded: number;
  seatPence: number;
  branchPence: number;
  /** The plan's monthly price in pence (null on Black) and how many months Annual charges. */
  monthlyPence: number | null;
  annualMonths: number;
  /** The price line for each billing option. For a Black account both read "No charge". */
  priceMonthly: string;
  priceAnnual: string;
  included: string;
  /** The Order table's Price List line: the extras and the date of the prices. */
  priceList: string;
  /** The extras on their own, for the summary on screen. */
  extras: string;
  onboardingFee: string;
  startDate: string;
  adminName: string;
  agreementVersion: string;
  dpaVersion: string;
};

export default function AcceptOrderForm({
  initial,
  summary,
  agreementText,
  dpaText,
  published,
  docLinks,
  billingApplies = true,
}: {
  initial: { legalName: string; companyNumber: string; address: string };
  summary: OrderSummary;
  agreementText: string;
  dpaText: string;
  published: boolean;
  docLinks: React.ReactNode;
  /** False for a Black account: never billed, so Monthly or Annual is not asked (Phil,
   *  2026-09-30). The server decides the same from the plan, whatever this form sends. */
  billingApplies?: boolean;
}) {
  const [legalName, setLegalName] = useState(initial.legalName);
  const [orgType, setOrgType] = useState("limited_company");
  const [companyNumber, setCompanyNumber] = useState(initial.companyNumber);
  const [address, setAddress] = useState(initial.address);
  const [billing, setBilling] = useState(billingApplies ? "monthly" : "none");
  const [accepted, setAccepted] = useState(false);
  const [extraUsers, setExtraUsers] = useState("0");
  const [extraBranches, setExtraBranches] = useState("0");
  const [extrasBilling, setExtrasBilling] = useState("yearly");
  const users = Math.max(0, Math.trunc(Number(extraUsers)) || 0);
  const branches = Math.max(0, Math.trunc(Number(extraBranches)) || 0);
  const costs = orderCosts({
    tier: summary.tier,
    plan: summary.plan,
    billingOption: billing,
    extrasBilling,
    monthlyPence: summary.monthlyPence,
    annualMonths: summary.annualMonths,
    extraUsers: users,
    extraBranches: branches,
    seatPence: summary.seatPence,
    branchPence: summary.branchPence,
    onboardingFee: summary.onboardingFee,
  });
  const chargeText = (n: number, unit: number) =>
    n === 0 ? "Nothing extra." : `You will be charged an extra ${money(n * unit)} a month (${n} x ${money(unit)}).`;
  const numberRequired = orgType === "limited_company" || orgType === "charity";
  const price = billing === "annual" ? summary.priceAnnual : summary.priceMonthly;

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ orgType, billing, accepted, extrasBilling });
  latest.current = { orgType, billing, accepted, extrasBilling };
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
        form.querySelectorAll<HTMLInputElement>('input[name="extras_billing"]').forEach((r) => {
          r.checked = r.value === v.extrasBilling;
        });
        const box = form.querySelector<HTMLInputElement>('input[name="accept"]');
        if (box) box.checked = v.accepted;
      }, 0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const filledAgreement = useMemo(
    () =>
      fillOrderTable(
        agreementText,
        orderTableValues({
          legalName,
          organisationType: orgType,
          companyNumber,
          address,
          plan: summary.plan,
          price,
          included: summary.included,
          extraUsers: extrasLineText(users, summary.seatPence, summary.tier),
          extraBranches: extrasLineText(branches, summary.branchPence, summary.tier),
          extrasPaid: extrasPaidText(costs, billing, summary.tier),
          total: costs.totalText,
          billingOption: billing,
          priceList: summary.priceList,
          onboardingFee: summary.onboardingFee,
          startDate: summary.startDate,
          acceptedBy: summary.adminName,
          acceptedOn: "When you press Accept",
          agreementVersion: summary.agreementVersion,
          dpaVersion: summary.dpaVersion,
        }),
      ),
    [agreementText, legalName, orgType, companyNumber, address, billing, price, users, branches, costs, summary],
  );

  const draftTag = published ? "" : ", draft";

  return (
    <ActionForm
      action={acceptAgreement}
      label="Accept"
      savingLabel="Accepting…"
      savedLabel="Accepted"
      buttonClassName="btn-primary text-sm"
      className="space-y-6"
    >
      {/* ---------------- 1. The Order ---------------- */}
      <div className="glass-card p-6 sm:p-8">
        <h2 className="text-sm font-semibold text-white">1. The Order</h2>
        <p className="mt-1 text-xs text-white/55">
          Check your details and correct anything that is not right. They fill in the Order at the end of the
          Subscription Agreement below.
        </p>

        <div ref={anchorRef} className="mt-5 grid gap-4 sm:grid-cols-2">
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
          <fieldset className="mt-4">
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
                Annual, paid yearly in advance
              </label>
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="billing_option" value="none" />
        )}

        {/* What the plan includes, the extras, and what it costs (Phil, 2026-09-30): plain weight
            throughout, no bold, charges in white so they read as clearly as the questions. */}
        <div className="mt-6 space-y-5 border-t border-white/10 pt-5 text-sm">
          <div>
            <p className="text-white/85">Your plan: {summary.plan}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-white/75">
              {summary.includedList.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {billingApplies ? (
            <>
              <div>
                <p className="text-white/85">
                  Your plan includes {summary.usersIncluded} {summary.usersIncluded === 1 ? "user" : "users"}.
                </p>
                <label htmlFor="extra_users" className="form-label mt-2">
                  How many extra users do you need?
                </label>
                <div className="max-w-[8rem]">
                  <input
                    id="extra_users"
                    name="extra_users"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_EXTRA_USERS}
                    step={1}
                    required
                    value={extraUsers}
                    onChange={(e) => setExtraUsers(e.target.value)}
                  />
                </div>
                <p className="mt-1 text-white">{chargeText(users, summary.seatPence)}</p>
              </div>

              <div>
                <p className="text-white/85">
                  Your plan includes the office team and {summary.branchesIncluded}{" "}
                  {summary.branchesIncluded === 1 ? "branch" : "branches"}.
                </p>
                <label htmlFor="extra_branches" className="form-label mt-2">
                  How many extra branches would you like to add?
                </label>
                <div className="max-w-[8rem]">
                  <input
                    id="extra_branches"
                    name="extra_branches"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_EXTRA_BRANCHES}
                    step={1}
                    required
                    value={extraBranches}
                    onChange={(e) => setExtraBranches(e.target.value)}
                  />
                </div>
                <p className="mt-1 text-white">{chargeText(branches, summary.branchPence)}</p>
              </div>

              {billing === "annual" && users + branches > 0 ? (
                <fieldset>
                  <legend className="form-label">How would you like to pay for the extras?</legend>
                  <div className="mt-1 space-y-2">
                    <label className="flex items-start gap-2 text-white/80">
                      <input
                        type="radio"
                        name="extras_billing"
                        value="yearly"
                        className="mt-0.5"
                        checked={extrasBilling === "yearly"}
                        onChange={() => setExtrasBilling("yearly")}
                      />
                      Yearly with the plan, ten months&apos; price for twelve
                    </label>
                    <label className="flex items-start gap-2 text-white/80">
                      <input
                        type="radio"
                        name="extras_billing"
                        value="monthly"
                        className="mt-0.5"
                        checked={extrasBilling === "monthly"}
                        onChange={() => setExtrasBilling("monthly")}
                      />
                      Monthly by card, the full price each month
                    </label>
                  </div>
                </fieldset>
              ) : (
                <input type="hidden" name="extras_billing" value={extrasBilling} />
              )}
            </>
          ) : null}

          {/* The breakdown, like an invoice. */}
          {costs.groups.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-white/85">{costs.totalText}</p>
          ) : (
            <div className="space-y-3">
              {costs.groups.map((g) => (
                <div key={g.heading} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-white/85">{g.heading}</p>
                  <dl className="mt-2 space-y-1">
                    {g.lines.map((l) => (
                      <div key={l.label} className="flex items-baseline justify-between gap-4 text-white/75">
                        <dt>{l.label}</dt>
                        <dd className="tabular-nums">{l.amount}</dd>
                      </div>
                    ))}
                    <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-white/10 pt-2 text-white">
                      <dt>{g.total.label}</dt>
                      <dd className="tabular-nums">{g.total.amount}</dd>
                    </div>
                  </dl>
                </div>
              ))}
              {costs.oneOff ? (
                <div className="flex items-baseline justify-between gap-4 px-4 text-white/75">
                  <span>{costs.oneOff.label}</span>
                  <span>{costs.oneOff.amount}</span>
                </div>
              ) : null}
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt className="text-white/55">Extra prices</dt>
            <dd className="text-white/85">{summary.extras}</dd>
            <dt className="text-white/55">Start date</dt>
            <dd className="text-white/85">{summary.startDate}</dd>
            <dt className="text-white/55">Accepted by</dt>
            <dd className="text-white/85">{summary.adminName}, Company Admin</dd>
          </dl>
        </div>
      </div>

      {/* ---------------- 2. The agreements ---------------- */}
      <details className="glass-card p-6" open>
        <summary className="cursor-pointer text-sm font-semibold text-white">
          2. Subscription Agreement, version {summary.agreementVersion}
          {draftTag}
        </summary>
        <p className="mt-2 text-xs text-white/55">The Order at the end is filled in from your details above.</p>
        <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <LegalDocumentView text={filledAgreement} compact />
        </div>
      </details>

      <details className="glass-card p-6">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          3. Data Processing Agreement, version {summary.dpaVersion}
          {draftTag}
        </summary>
        <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <LegalDocumentView text={dpaText} compact />
        </div>
      </details>

      {/* ---------------- 3. Accept ---------------- */}
      <div className="glass-card space-y-4 p-6">
        {docLinks}
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
      </div>
    </ActionForm>
  );
}

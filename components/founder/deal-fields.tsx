"use client";

import { useEffect, useRef, useState } from "react";
import { pluralOf } from "@/lib/billing/deal";

/**
 * THE DEAL (Phil, 2026-09-30): the fields a founder fills in to fix a company's Order and any
 * special prices. Shared by Create a company and the founder company page, so both look and
 * behave the same. Field names are read by lib/billing/deal-store.ts.
 *
 * "Let them choose" keeps today's behaviour: the Admin picks the extras and Monthly or Annual on
 * the Order. "Fix the deal" fills the Order in for them and they cannot change the numbers.
 */

export type DealDefaults = {
  billing_option: string | null;
  extras_billing: string | null;
  extra_users: number | null;
  extra_branches: number | null;
  plan_price_pence: number | null;
  seat_price_pence: number | null;
  branch_price_pence: number | null;
  branch_step_after: number | null;
  branch_step_price_pence: number | null;
  onboarding_fee_pence: number | null;
  notes: string | null;
} | null;

const pounds = (p: number | null | undefined) => (p === null || p === undefined ? "" : (p / 100).toFixed(2).replace(/\.00$/, ""));

export function DealFields({
  defaults,
  branchWord,
  branchWordPlural,
  showMoreBranches = false,
}: {
  defaults: DealDefaults;
  branchWord?: string | null;
  branchWordPlural?: string | null;
  showMoreBranches?: boolean;
}) {
  const [mode, setMode] = useState(defaults ? "fixed" : "none");
  const [billing, setBilling] = useState(defaults?.billing_option ?? "monthly");
  const [onboarding, setOnboarding] = useState(
    defaults?.onboarding_fee_pence === null || defaults?.onboarding_fee_pence === undefined
      ? "standard"
      : defaults.onboarding_fee_pence === 0
        ? "waived"
        : "custom",
  );

  /* React 19 resets a form after its action runs. The radios and selects below are controlled,
     so without this they would keep their chosen value while the rest of the form went back to
     its defaults (the DEF-082 trap). Put them back to the defaults with everything else. */
  const box = useRef<HTMLDivElement>(null);
  const pluralRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setMode(defaults ? "fixed" : "none");
      setBilling(defaults?.billing_option ?? "monthly");
      setOnboarding(
        defaults?.onboarding_fee_pence === null || defaults?.onboarding_fee_pence === undefined
          ? "standard"
          : defaults.onboarding_fee_pence === 0
            ? "waived"
            : "custom",
      );
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaults]);

  return (
    <div ref={box} className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white/90">What they call a branch</p>
        <p className="form-hint">
          Leave blank for Branch. Whatever you put here is what they see everywhere: menus, registers, reports,
          their agreement and their invoices.
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="branch_word" className="form-label">One</label>
            <input
              id="branch_word"
              name="branch_word"
              maxLength={30}
              placeholder="House"
              defaultValue={branchWord ?? ""}
              onBlur={(e) => {
                /* A smarter guess at the plural, filled in where it can be seen and changed
                   (Phil, 2026-09-30): Property gives Properties, Branch gives Branches. */
                const plural = pluralRef.current;
                if (plural && !plural.value.trim() && e.currentTarget.value.trim()) {
                  plural.value = pluralOf(e.currentTarget.value);
                }
              }}
            />
          </div>
          <div>
            <label htmlFor="branch_word_plural" className="form-label">More than one</label>
            <input ref={pluralRef} id="branch_word_plural" name="branch_word_plural" maxLength={30} placeholder="Houses" defaultValue={branchWordPlural ?? ""} />
            <p className="form-hint">Filled in for you from the word above. Change it if it is not right.</p>
          </div>
        </div>
      </div>

      {showMoreBranches ? (
        <div>
          <label htmlFor="more_branches" className="form-label">More branches (optional)</label>
          <textarea id="more_branches" name="more_branches" rows={3} placeholder={"Treehouse\nOakhouse"} />
          <p className="form-hint">One name per line, added as well as the first branch above. Each one beyond the plan&apos;s allowance is an extra branch on their bill.</p>
        </div>
      ) : null}

      <fieldset>
        <legend className="text-sm font-semibold text-white/90">The deal</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/80">
          <label className="flex items-center gap-2">
            <input type="radio" name="deal_mode" value="none" checked={mode === "none"} onChange={() => setMode("none")} />
            Let them choose on the Order
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="deal_mode" value="fixed" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
            Fix the deal below
          </label>
        </div>
      </fieldset>

      {mode === "fixed" ? (
        <div className="space-y-5 rounded-xl border border-white/10 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deal_billing" className="form-label">Pays</label>
              <select id="deal_billing" name="deal_billing" value={billing} onChange={(e) => setBilling(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (ten months for twelve)</option>
              </select>
            </div>
            {billing === "annual" ? (
              <div>
                <label htmlFor="deal_extras_billing" className="form-label">Extras paid</label>
                <select id="deal_extras_billing" name="deal_extras_billing" defaultValue={defaults?.extras_billing ?? "yearly"}>
                  <option value="yearly">Yearly with the plan (ten months for twelve)</option>
                  <option value="monthly">Monthly by card</option>
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="deal_extra_users" className="form-label">Extra users</label>
              <input id="deal_extra_users" name="deal_extra_users" type="number" min={0} max={500} defaultValue={defaults?.extra_users ?? 0} />
              <p className="form-hint">Beyond what the plan includes (Business 4, Pro 6).</p>
            </div>
            <div>
              <label htmlFor="deal_extra_branches" className="form-label">Extra branches</label>
              <input id="deal_extra_branches" name="deal_extra_branches" type="number" min={0} max={50} defaultValue={defaults?.extra_branches ?? 0} />
              <p className="form-hint">Beyond what the plan includes (Business 1, Pro 2). Nine houses on Pro is 7 extra.</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-white/90">Special prices</p>
            <p className="form-hint">In pounds a month, before VAT. Leave blank for the normal price. Annual is still ten months for twelve.</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="deal_plan_price" className="form-label">Plan</label>
                <input id="deal_plan_price" name="deal_plan_price" inputMode="decimal" placeholder="Normal" defaultValue={pounds(defaults?.plan_price_pence)} />
              </div>
              <div>
                <label htmlFor="deal_seat_price" className="form-label">Each extra user</label>
                <input id="deal_seat_price" name="deal_seat_price" inputMode="decimal" placeholder="5" defaultValue={pounds(defaults?.seat_price_pence)} />
              </div>
              <div>
                <label htmlFor="deal_branch_price" className="form-label">Each extra branch</label>
                <input id="deal_branch_price" name="deal_branch_price" inputMode="decimal" placeholder="25" defaultValue={pounds(defaults?.branch_price_pence)} />
              </div>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="deal_step_after" className="form-label">Two-step: first how many extra branches at that price?</label>
                <input id="deal_step_after" name="deal_step_after" type="number" min={1} max={49} placeholder="e.g. 3" defaultValue={defaults?.branch_step_after ?? ""} />
              </div>
              <div>
                <label htmlFor="deal_step_price" className="form-label">Then each further extra branch</label>
                <input id="deal_step_price" name="deal_step_price" inputMode="decimal" placeholder="e.g. 10" defaultValue={pounds(defaults?.branch_step_price_pence)} />
              </div>
            </div>
            <p className="form-hint">Leave both two-step boxes blank for one price per extra branch.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deal_onboarding" className="form-label">Onboarding fee</label>
              <select id="deal_onboarding" name="deal_onboarding" value={onboarding} onChange={(e) => setOnboarding(e.target.value)}>
                <option value="standard">Current offer (waived until 31 December 2026, then £295)</option>
                <option value="waived">Waived</option>
                <option value="custom">Another amount</option>
              </select>
            </div>
            {onboarding === "custom" ? (
              <div>
                <label htmlFor="deal_onboarding_amount" className="form-label">Onboarding fee, £</label>
                <input id="deal_onboarding_amount" name="deal_onboarding_amount" inputMode="decimal" placeholder="150" defaultValue={pounds(defaults?.onboarding_fee_pence)} />
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="deal_notes" className="form-label">Notes for you (not shown to them)</label>
            <textarea id="deal_notes" name="deal_notes" rows={2} maxLength={2000} defaultValue={defaults?.notes ?? ""} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

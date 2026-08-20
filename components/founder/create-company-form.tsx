"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCompany } from "@/app/(app)/founder/actions";
import { IDLE_STATE } from "@/lib/forms";

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompany, IDLE_STATE);
  /* THE COMPANY EXISTS NOW, so the button must stop offering to make it again (Phil,
     2026-08-19: it stayed live under a gold "created" box, and a second press only ever
     produced a slug clash). The id comes back with the result, so there is somewhere to go. */
  const createdId = state.data?.companyId ?? null;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="form-label">
            Company name
          </label>
          <input id="name" name="name" required placeholder="Bluebird Care Cardiff" />
        </div>
        <div>
          <label htmlFor="slug" className="form-label">
            Slug (optional)
          </label>
          <input id="slug" name="slug" placeholder="derived from name" />
          <p className="form-hint">Used in URLs. Leave blank to auto generate.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tier" className="form-label">
            Tier
          </label>
          <select id="tier" name="tier" defaultValue="business">
            <option value="business">Business</option>
            <option value="pro">Pro</option>
            <option value="black">Black (free, founder granted)</option>
          </select>
        </div>
        <div>
          <label htmlFor="trial_days" className="form-label">
            Trial days
          </label>
          <input
            id="trial_days"
            name="trial_days"
            type="number"
            min={0}
            max={365}
            defaultValue={14}
          />
          <p className="form-hint">
            0 for no trial. A trial covers one branch and two colleagues besides the Admin, and
            the Admin is told so the moment they sign in.
          </p>
        </div>
        <div>
          <label htmlFor="branch_name" className="form-label">
            First branch name
          </label>
          <input id="branch_name" name="branch_name" placeholder="Main Branch" />
          <p className="form-hint">A Team (office) is seeded automatically.</p>
        </div>
      </div>

      {/*
        REGULATOR IS REQUIRED, AND THERE IS NO DEFAULT ON PURPOSE.
        Until 2026-08-19 this field was not on the form at all and was written by nothing in the
        product, so every company created here was a care provider that could not say who
        inspected it — and the compliance score, Inspection Readiness, Reg 73, Reg 80, the
        incidents screen and the privacy notice all read it. Defaulting it would be worse than
        asking: a Welsh provider silently measured against CQC's key questions looks like a
        working product right up until an inspector reads the report.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="regulator" className="form-label">
            Regulator
          </label>
          <select id="regulator" name="regulator" required defaultValue="">
            <option value="" disabled>
              Please choose
            </option>
            <option value="ciw">CIW (Wales)</option>
            <option value="cqc">CQC (England)</option>
          </select>
          <p className="form-hint">
            Who inspects them. It decides which framework their readiness is measured against,
            and whether the RISCA reports (Reg 73, Reg 80) apply.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 pt-5">
        <p className="mb-3 text-sm font-semibold text-white/90">
          Invite the first Company Admin (optional)
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="admin_name" className="form-label">
              Admin name
            </label>
            <input id="admin_name" name="admin_name" placeholder="Jane Morgan" />
            <p className="mt-1 text-xs text-white/45">Needed if you enter an email address.</p>
          </div>
          <div>
            <label htmlFor="admin_email" className="form-label">
              Admin email
            </label>
            <input
              id="admin_email"
              name="admin_email"
              type="email"
              placeholder="jane@company.co.uk"
            />
          </div>
        </div>
        <p className="form-hint">
          They receive a branded invite to set their password. Leave blank to
          invite later.
        </p>

        <label className="mt-3 flex items-start gap-2 text-sm text-white/80">
          <input type="checkbox" name="hold_email" value="1" className="mt-0.5" />
          <span>
            Don&rsquo;t send the email yet
            <span className="block text-xs text-white/50">
              The account is created and waits on their Settings, Users as &ldquo;Not sent
              yet&rdquo;. Useful when the tenant is not ready for them to look at it.
            </span>
          </span>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          className="rounded-xl border border-gold-400/40 bg-gold-400/15 px-3.5 py-2.5 text-sm text-gold-300"
        >
          {state.ok}
        </p>
      ) : null}

      {createdId ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled className="btn-saved cursor-default px-4 py-2 text-sm">
            Company created
          </button>
          <Link href={`/founder/companies/${createdId}`} className="btn-primary px-4 py-2 text-sm">
            Go to company
          </Link>
        </div>
      ) : (
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create company"}
        </button>
      )}
    </form>
  );
}

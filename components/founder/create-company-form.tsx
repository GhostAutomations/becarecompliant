"use client";

import { useActionState } from "react";
import { createCompany } from "@/app/(app)/founder/actions";
import { IDLE_STATE } from "@/lib/forms";

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompany, IDLE_STATE);

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
            <option value="enterprise">Enterprise</option>
            <option value="diamond">Diamond (usage only)</option>
            <option value="black">Black (free, founder granted)</option>
          </select>
        </div>
        <div>
          <label htmlFor="branch_name" className="form-label">
            First branch name
          </label>
          <input id="branch_name" name="branch_name" placeholder="Main Branch" />
          <p className="form-hint">A Team (office) is seeded automatically.</p>
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

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}

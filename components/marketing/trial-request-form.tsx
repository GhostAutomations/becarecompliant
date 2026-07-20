"use client";

import { useActionState } from "react";
import { submitTrialRequest } from "@/lib/marketing/actions";
import { IDLE_STATE } from "@/lib/forms";

export default function TrialRequestForm({ defaultTier = "" }: { defaultTier?: string }) {
  const [state, action, pending] = useActionState(submitTrialRequest, IDLE_STATE);

  if (state.ok) {
    return (
      <div className="glass-card border border-rag-green/20 p-6 text-center">
        <p className="text-lg font-semibold text-white">Request received</p>
        <p className="mt-2 text-sm text-white/70">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="glass-card space-y-5 p-6">
      {/* Honeypot: hidden from people, tempting to bots. Leave empty. */}
      <input
        type="text"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="company_name" className="form-label">Care company name *</label>
          <input id="company_name" name="company_name" required autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="contact_name" className="form-label">Your name *</label>
          <input id="contact_name" name="contact_name" required autoComplete="name" />
        </div>
        <div>
          <label htmlFor="email" className="form-label">Work email *</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="phone" className="form-label">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="team_size" className="form-label">How many staff</label>
          <input id="team_size" name="team_size" placeholder="e.g. 25" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tier_interest" className="form-label">Plan you are interested in</label>
          <select id="tier_interest" name="tier_interest" defaultValue={defaultTier}>
            <option value="">Not sure yet</option>
            <option value="business">Business</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="message" className="form-label">Anything you want us to know</label>
          <textarea id="message" name="message" rows={3} />
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Request my 14 day trial"}
      </button>
      <p className="text-center text-xs text-white/45">
        No card needed. We will set your trial up and send your login.
      </p>
    </form>
  );
}

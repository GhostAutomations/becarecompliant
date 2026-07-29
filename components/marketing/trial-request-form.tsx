"use client";

import { useActionState } from "react";
import { submitTrialRequest } from "@/lib/marketing/actions";
import { IDLE_STATE } from "@/lib/forms";

/**
 * The trial request form.
 *
 * THREE FIELDS, THEN EVERYTHING ELSE OUT OF THE WAY. The page promises "three details are
 * all we need" and the form used to show seven controls, four of them carrying the word
 * optional. People count the boxes long before they read the labels, so the promise was
 * being broken by the layout rather than by the words. The three we genuinely need now
 * stand alone and the rest sit behind one line they can ignore.
 *
 * The disclosure starts OPEN when somebody arrived from the pricing page with a plan in the
 * query string, because in that case the plan really has been chosen for them and hiding it
 * would look like we had lost it.
 *
 * Every empty field carries a placeholder. Without one, the filled input style read as a box
 * that was already completed or disabled, which is the opposite of what an empty required
 * field should look like.
 */
export default function TrialRequestForm({ defaultTier = "" }: { defaultTier?: string }) {
  const [state, action, pending] = useActionState(submitTrialRequest, IDLE_STATE);

  if (state.ok) {
    return (
      <div className="glass-card border border-rag-green/20 p-6 text-center">
        <p className="text-lg font-semibold text-white">Request received</p>
        <p className="mt-2 text-sm text-white/80">{state.ok}</p>
        <p className="mt-3 text-xs text-white/60">
          A person reads every request. Nothing is charged and no account goes live until we have sent your logins.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="glass-card space-y-6 p-6">
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
          <label htmlFor="company_name" className="form-label">Care company name</label>
          <input
            id="company_name"
            name="company_name"
            required
            autoComplete="organization"
            placeholder="e.g. Sunrise Home Care Ltd"
          />
        </div>
        <div>
          <label htmlFor="contact_name" className="form-label">Your name</label>
          <input
            id="contact_name"
            name="contact_name"
            required
            autoComplete="name"
            placeholder="e.g. Alex Morgan"
          />
        </div>
        <div>
          {/* "Email", not "Work email". Small providers run on personal addresses and we
              accept them by design, so the old label invited a moment of doubt from exactly
              the people most likely to sign up. */}
          <label htmlFor="email" className="form-label">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="e.g. alex@sunrisehomecare.co.uk"
            aria-describedby="email_hint"
          />
          <p id="email_hint" className="mt-1.5 text-xs text-white/60">
            Where we send your logins.
          </p>
        </div>
      </div>

      <details open={Boolean(defaultTier)} className="border-t border-white/10 pt-5">
        <summary className="cursor-pointer text-sm text-gold-300 hover:text-gold-400">
          Add a few optional details, or skip them
        </summary>
        <p className="mt-2 text-xs text-white/60">
          None of this is needed to ask for a trial. It just helps us have the account set up
          the way you work before we hand it over.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="form-label">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="e.g. 029 2018 0000"
            />
          </div>
          <div>
            <label htmlFor="team_size" className="form-label">How many staff</label>
            <input id="team_size" name="team_size" placeholder="e.g. 25" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="tier_interest" className="form-label">Plan you are interested in</label>
            <select id="tier_interest" name="tier_interest" defaultValue={defaultTier}>
              <option value="">Not sure yet</option>
              <option value="business">Business, £49 a month plus VAT</option>
              <option value="pro">Pro, £69 a month plus VAT</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="message" className="form-label">Anything you want us to know</label>
            <textarea
              id="message"
              name="message"
              rows={3}
              placeholder="How many services you run, when your last inspection was, what you use today"
            />
          </div>
        </div>
      </details>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Request my 14 day trial"}
      </button>
      <p className="text-center text-xs text-white/60">
        No card needed. We set the trial up and send your logins, usually the same working day.
      </p>
    </form>
  );
}

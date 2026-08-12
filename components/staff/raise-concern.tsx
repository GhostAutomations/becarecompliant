"use client";

/**
 * Be Care Compliant — "Raise a concern", in a Team Member's own area.
 *
 * On success the form is REPLACED by a confirmation and there is no link back to what was
 * sent, no copy kept on their account, and no navigation. Two reasons. A record of "you
 * raised a concern on the 12th" sitting in a carer's own portal is a trail on the person
 * who did the right thing — readable by anyone who picks up their unlocked phone. And a
 * status they could watch would tell them whether anyone had opened it, which is the
 * Admin's business, not a progress bar.
 */

import { useActionState } from "react";
import { raiseConcern } from "@/lib/whistleblowing/raise";
import { IDLE_STATE } from "@/lib/forms";
import { DISCLOSURE_CATEGORIES } from "@/lib/whistleblowing/types";

export default function RaiseConcern() {
  const [state, formAction, pending] = useActionState(raiseConcern, IDLE_STATE);

  if (state.ok) {
    return (
      <div className="glass-card p-6 text-sm text-white/80">
        <p className="text-base font-semibold text-white">Your concern has been sent.</p>
        <p className="mt-2">
          It has gone to the Admin and the Responsible Individual. Nobody else in the company
          can see it, including managers.
        </p>
        <p className="mt-2 text-white/60">
          Nothing about it is kept on your account and there is no copy on this page, so
          please keep your own note of what you said and when if you may need it later.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="concern_category" className="form-label">What is it about?</label>
        <select id="concern_category" name="category" defaultValue="">
          <option value="">Not sure / something else</option>
          {DISCLOSURE_CATEGORIES.filter((c) => c !== "Other").map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="concern_disclosure" className="form-label">What has happened? *</label>
        <textarea
          id="concern_disclosure"
          name="disclosure"
          rows={7}
          required
          placeholder="What you saw or were told, when, and who was involved. Write as much or as little as you want to."
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm text-white/80">
        <input type="checkbox" name="named" className="mt-0.5" />
        <span>
          You may use my name
          <span className="block text-xs text-white/50">
            Leave this alone to stay anonymous. If you leave it alone your name is not stored
            anywhere on the concern — not hidden, not stored. Tick it only if you are happy for
            the Admin to know it came from you, for instance so they can come back to you.
          </span>
        </span>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

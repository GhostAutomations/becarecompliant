"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { IDLE_STATE } from "@/lib/forms";

export function ForgotForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, IDLE_STATE);

  /* Once sent, the form is replaced by the answer: pressing again would only hit the throttle,
     and a form still sitting there invites it. */
  if (state.ok) {
    return (
      <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-100">
        {state.ok}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {notice ? (
        <p role="status" className="rounded-xl border border-gold-400/40 bg-gold-400/15 px-3.5 py-2.5 text-sm text-gold-300">
          {notice}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="form-label text-white/90">
          Email address
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.co.uk" />
      </div>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send me a reset link"}
      </button>
    </form>
  );
}

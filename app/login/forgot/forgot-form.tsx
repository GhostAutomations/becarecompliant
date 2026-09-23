"use client";

import { useActionState, useEffect, useState } from "react";
import { requestPasswordReset } from "../actions";
import { IDLE_STATE } from "@/lib/forms";
import { RESET_THROTTLE_MINUTES } from "@/lib/auth/password-reset-rules";

/**
 * "Forgot your password?" form.
 *
 * THE WAIT IS SHOWN, NOT HIDDEN (Phil, 2026-09-23: "they need to be told that on the screen other
 * wise they will keep checking email and requesting more"). After sending, the form is replaced by
 * the answer and a countdown; "Send another link" only appears once the wait is over, because a
 * request inside it sends nothing and the button would lie. The same answer and the same countdown
 * appear whatever the address, so the screen still does not say who has an account.
 */
export function ForgotForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, IDLE_STATE);
  const [email, setEmail] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [again, setAgain] = useState(false);

  useEffect(() => {
    if (state.ok && !pending) {
      setSentAt(Date.now());
      setAgain(false);
    }
  }, [state, pending]);

  useEffect(() => {
    if (sentAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);

  const waitMs = RESET_THROTTLE_MINUTES * 60_000;
  const left = sentAt === null ? 0 : Math.max(0, sentAt + waitMs - now);
  const mins = Math.floor(left / 60_000);
  const secs = Math.floor((left % 60_000) / 1000);

  if (sentAt !== null && !again) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-100">
          {state.ok}
        </p>
        {left > 0 ? (
          <p className="text-center text-sm text-white/60">
            You can ask for another link in{" "}
            <span className="font-semibold text-white">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
          </p>
        ) : (
          <button type="button" className="btn-outline w-full" onClick={() => setAgain(true)}>
            Send another link
          </button>
        )}
      </div>
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
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
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

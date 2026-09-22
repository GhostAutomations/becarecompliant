"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import type { LoginState } from "@/lib/auth/types";

const initialState: LoginState = { error: null };

export function LoginForm({ notice, next }: { notice?: string; next?: string | null }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {/* Where they were headed before the sign-in wall. Validated again on the server. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-gold-400/40 bg-gold-400/15 px-3.5 py-2.5 text-sm text-gold-300"
        >
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
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password" className="form-label text-white/90">
            Password
          </label>
          {/* THE WAY BACK IN (2026-09-23). Before this a forgotten password could only be put
              right by the Founder in the Supabase dashboard. */}
          <a href="/login/forgot" className="text-xs text-gold-300 hover:text-gold-200">
            Forgot your password?
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
        />
      </div>

      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-white/60">
        Accounts are invite only. Ask your administrator for an invite.
      </p>
    </form>
  );
}

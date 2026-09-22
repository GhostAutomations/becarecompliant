"use client";

import { useActionState } from "react";
import { setNewPassword } from "../actions";
import { IDLE_STATE } from "@/lib/forms";

export function ResetForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(setNewPassword, IDLE_STATE);
  return (
    <form action={formAction} className="space-y-5">
      {/* Read only email as the login identity, so a password manager saves the new password
          against the right account. */}
      <div>
        <label htmlFor="email" className="form-label text-white/90">
          Email
        </label>
        <input id="email" name="email" type="email" value={email} readOnly autoComplete="username" className="cursor-not-allowed opacity-80" />
      </div>
      <div>
        <label htmlFor="password" className="form-label text-white/90">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required placeholder="At least 8 characters" />
      </div>
      <div>
        <label htmlFor="confirm" className="form-label text-white/90">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required placeholder="Re enter your new password" />
      </div>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

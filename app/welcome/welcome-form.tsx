"use client";

import { useActionState } from "react";
import { completeInvite } from "./actions";
import { IDLE_STATE } from "@/lib/forms";

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(
    completeInvite,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="full_name" className="form-label">
          Your name
        </label>
        <input
          id="full_name"
          name="full_name"
          defaultValue={defaultName}
          placeholder="Your full name"
        />
      </div>

      <div>
        <label htmlFor="password" className="form-label">
          Create a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="form-label">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Re enter your password"
        />
      </div>

      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Set password and continue"}
      </button>
    </form>
  );
}

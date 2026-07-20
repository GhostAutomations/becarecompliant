"use client";

/**
 * Billing action buttons. Subscribe (Checkout) and Manage billing (Portal) both
 * resolve to a Stripe-hosted URL in ActionState.redirectTo; we navigate there
 * with window.location because it is EXTERNAL (the Next router is for in-app
 * routes only). Follows the save button rules: solid gold primary, instant
 * working state, disabled while busy, errors shown next to the button.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { startCheckout, openBillingPortal, startAiTopupCheckout } from "@/lib/billing/actions";

function useRedirect(redirectTo?: string) {
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);
}

export function SubscribeButton({
  label = "Subscribe and add a card",
}: {
  label?: string;
}) {
  const [state, action, pending] = useActionState(startCheckout, IDLE_STATE);
  useRedirect(state.redirectTo);
  const busy = pending || !!state.redirectTo;
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Opening secure checkout…" : label}
        </button>
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}

export function TopUpCreditsButton({ label = "Buy more credits" }: { label?: string }) {
  const [state, action, pending] = useActionState(startAiTopupCheckout, IDLE_STATE);
  useRedirect(state.redirectTo);
  const busy = pending || !!state.redirectTo;
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-outline text-sm" disabled={busy}>
          {busy ? "Opening secure checkout…" : label}
        </button>
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}

export function ManageBillingButton({
  label = "Manage billing",
  variant = "outline",
}: {
  label?: string;
  variant?: "primary" | "outline";
}) {
  const [state, action, pending] = useActionState(openBillingPortal, IDLE_STATE);
  useRedirect(state.redirectTo);
  const busy = pending || !!state.redirectTo;
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={`btn ${variant === "primary" ? "btn-primary" : "btn-outline"}`}
          disabled={busy}
        >
          {busy ? "Opening…" : label}
        </button>
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}

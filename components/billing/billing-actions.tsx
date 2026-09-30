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
import {
  startCheckout,
  openBillingPortal,
  startAiTopupCheckout,
  startSmsTopupCheckout,
  startInvoiceSubscription,
} from "@/lib/billing/actions";

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

export function TopUpSmsButton({ label = "Buy more SMS" }: { label?: string }) {
  const [state, action, pending] = useActionState(startSmsTopupCheckout, IDLE_STATE);
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

/**
 * "Prefer to pay by bank transfer? Get an invoice instead" (Annual only, Phil 2026-09-30).
 * Stripe emails the invoice; the link also comes straight back here so it can be opened now.
 * The word while it works matches the word when it is done: "Sending…" then "Sent".
 */
export function InvoiceInsteadButton({ label = "Get an invoice instead" }: { label?: string }) {
  const [state, action, pending] = useActionState(startInvoiceSubscription, IDLE_STATE);
  if (state.ok) {
    const url = state.data?.invoiceUrl;
    return (
      <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/85">
        <p>
          Sent. Your invoice is on its way to {state.data?.email || "your email"}. It is payable within 14 days, by
          card or by bank transfer to the account details on the invoice.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline text-sm">
              View and pay the invoice
            </a>
          ) : null}
          <a href="/dashboard" className="btn btn-primary text-sm">
            Continue
          </a>
        </div>
      </div>
    );
  }
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-outline text-sm" disabled={pending}>
          {pending ? "Sending…" : label}
        </button>
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}

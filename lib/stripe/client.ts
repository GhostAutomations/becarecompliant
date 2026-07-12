import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client. The secret key NEVER reaches the browser (no
 * NEXT_PUBLIC_). Like the Supabase service client, importing this into a client
 * component fails the build via "server-only".
 *
 * Returns null when STRIPE_SECRET_KEY is unset so every caller surfaces the
 * dependency in the UI instead of silently no-opping (same discipline as
 * Resend/Twilio). Use stripeConfigured() for a boolean check.
 *
 * We do NOT hard-pin apiVersion: stripe-node aligns each request to the API
 * version current at the SDK release, which keeps the bundled TypeScript types
 * in step. Override with STRIPE_API_VERSION only if a specific pin is needed.
 */
let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (cached) return cached;
  const apiVersion = process.env.STRIPE_API_VERSION as
    | Stripe.StripeConfig["apiVersion"]
    | undefined;
  cached = new Stripe(process.env.STRIPE_SECRET_KEY, {
    ...(apiVersion ? { apiVersion } : {}),
    typescript: true,
    appInfo: { name: "Be Care Compliant", url: "https://www.becarecompliant.com" },
  });
  return cached;
}

/** Throwing variant for server actions that cannot proceed without Stripe. */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error(
      "Billing is not configured. Set STRIPE_SECRET_KEY (server-only) in the environment.",
    );
  }
  return stripe;
}

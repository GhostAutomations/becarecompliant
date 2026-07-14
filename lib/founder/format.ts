// Shared presentational helpers for the founder console. Pure functions, no
// "use server". TIER_LABELS lives in lib/stripe/config (single source).

import { TIER_LABELS, type Tier } from "@/lib/stripe/config";

/** Safe tier label lookup that accepts any string (falls back to the raw value). */
export function tierLabel(tier: string): string {
  return TIER_LABELS[tier as Tier] ?? tier;
}

/** Company lifecycle status → pill class. */
export function companyStatusPillClass(status: string): string {
  if (status === "active") return "pill-green";
  if (status === "suspended") return "pill-amber";
  return "pill-neutral";
}

/** Stripe subscription status → a customer-safe pill (class + label). */
export function billingStatusPill(status: string | null): {
  cls: string;
  text: string;
} {
  switch (status) {
    case "active":
    case "trialing":
      return { cls: "pill-green", text: "Subscribed" };
    case "past_due":
    case "unpaid":
      return { cls: "pill-red", text: "Payment due" };
    case "canceled":
      return { cls: "pill-neutral", text: "Cancelled" };
    case "incomplete":
    case "incomplete_expired":
      return { cls: "pill-amber", text: "Not finished" };
    default:
      return { cls: "pill-neutral", text: "No subscription" };
  }
}

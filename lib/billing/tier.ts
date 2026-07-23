import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tier } from "@/lib/stripe/config";

/**
 * Server-side tier gating. Feature access is decided HERE, never in the UI
 * alone: a page or action calls featureEnabled / requireFeature before doing
 * gated work. companies.tier is the source of truth (set by the Founder);
 * Stripe state only reflects billing, it does not grant features.
 *
 * FEATURES LADDER (two public tiers, Phil 2026-07-19):
 *   - Business (core): People + Service User registers, checks, RAG, holiday and
 *     absence, training records, dashboard, role based access, bulk import, forms
 *     as evidence, email digest, the BASIC compliance register report, one branch.
 *   - Pro adds: complaints management, ALL reports (PQS, evidence packs, audit
 *     trail, training) + inspector exports, SMS reminders, the form builder, and
 *     Service User personal outcomes + satisfaction tracking (PQS).
 *   - AI is on every tier now, metered by credits (see lib/billing/ai-credits.ts),
 *     so it is NOT gated here. ai_features remains only for legacy references.
 *   - Enterprise/Diamond/Black are legacy/premium and get everything.
 */

export type Feature =
  | "sms_reminders"
  | "reporting_exports"
  | "form_builder"
  | "complaints"
  | "invoicing"
  | "outcomes_satisfaction"
  | "planner"
  | "on_call"
  | "ai_features"
  | "integration_layer"
  | "priority_support";

/** The minimum ordered subscription tier that unlocks each feature. */
const PRO_FEATURES: Feature[] = ["sms_reminders", "reporting_exports", "form_builder", "complaints", "invoicing", "outcomes_satisfaction", "planner", "on_call"];
const ENTERPRISE_FEATURES: Feature[] = [
  "ai_features",
  "integration_layer",
  "priority_support",
];

/** Pure: does this tier include this feature? Safe to unit-test without a DB. */
export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  // Premium/partner tiers get everything.
  if (tier === "diamond" || tier === "black") return true;
  if (tier === "enterprise") {
    return PRO_FEATURES.includes(feature) || ENTERPRISE_FEATURES.includes(feature);
  }
  if (tier === "pro") return PRO_FEATURES.includes(feature);
  // business (and any unknown tier) = core only.
  return false;
}

/** The lowest tier that unlocks a feature, for upgrade messaging. */
export function featureMinTier(feature: Feature): Tier {
  return ENTERPRISE_FEATURES.includes(feature) ? "enterprise" : "pro";
}

/** Read a company's tier. Defaults to "business" (least privilege) if unknown. */
export async function getCompanyTier(companyId: string): Promise<Tier> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("tier")
    .eq("id", companyId)
    .maybeSingle();
  const tier = (data?.tier ?? "business") as Tier;
  return tier;
}

/** Convenience: is a feature enabled for a company right now? */
export async function featureEnabled(
  companyId: string,
  feature: Feature,
): Promise<boolean> {
  const tier = await getCompanyTier(companyId);
  return tierHasFeature(tier, feature);
}

/**
 * Guard for server actions: returns an error string when the feature is not on
 * the company's tier, or null when allowed. Callers surface the string in the
 * UI (ActionState) so gating stays visible, never a silent no-op.
 */
export async function requireFeature(
  companyId: string,
  feature: Feature,
): Promise<string | null> {
  if (await featureEnabled(companyId, feature)) return null;
  const min = featureMinTier(feature);
  const label = min.charAt(0).toUpperCase() + min.slice(1);
  return `This feature is available on the ${label} tier and above.`;
}

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { seatPriceId } from "@/lib/stripe/config";
import { writeAudit } from "@/lib/audit";
import { upsertCompanyBilling } from "@/lib/billing/stripe-sync";

/**
 * Stripe webhook. The source of truth for subscription state: we provision and
 * update company_billing HERE, never on the Checkout success page.
 *
 * Security:
 *  - Raw body signature verification (constructEvent on request.text(), never a
 *    parsed body, or the signature will not match).
 *  - Fails CLOSED: no STRIPE_WEBHOOK_SECRET (or no secret key) returns 503, so a
 *    misconfigured deploy rejects events rather than trusting unsigned input.
 *  - Idempotent: every event id is claimed in stripe_events first; a duplicate
 *    delivery is skipped. Handlers are themselves idempotent (they upsert to the
 *    state the event describes), so a retry after a failure is always safe.
 *  - This path sits under the /api/webhooks PUBLIC_PATHS prefix (no user session);
 *    the Stripe signature is the auth.
 */

export const dynamic = "force-dynamic";

type Claim = "claimed" | "reprocess" | "skip";

async function claimEvent(event: Stripe.Event): Promise<Claim> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    status: "processing",
  });
  if (!error) return "claimed";
  if (error.code === "23505") {
    // Seen before. Only skip if it already completed; otherwise allow a safe,
    // idempotent reprocess (handler failed previously and Stripe retried).
    const { data } = await supabase
      .from("stripe_events")
      .select("status")
      .eq("id", event.id)
      .maybeSingle();
    return data?.status === "processed" ? "skip" : "reprocess";
  }
  // Unexpected DB error: reprocess rather than drop the event.
  console.error("[stripe] claim failed:", error.message, event.id);
  return "reprocess";
}

async function settleEvent(
  eventId: string,
  status: "processed" | "failed",
  companyId: string | null,
  error?: string,
) {
  const supabase = createServiceClient();
  await supabase
    .from("stripe_events")
    .update({
      status,
      company_id: companyId,
      error: error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

/** Resolve the company for an event: metadata first, then the customer link. */
async function resolveCompanyId(
  customerId: string | null,
  metaCompanyId?: string | null,
): Promise<string | null> {
  if (metaCompanyId) return metaCompanyId;
  if (!customerId) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select("company_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.company_id ?? null;
}

async function companyTier(companyId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("companies")
    .select("tier")
    .eq("id", companyId)
    .maybeSingle();
  return data?.tier ?? null;
}

function unixToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;
}

/** current_period_end moved onto items in newer API versions; read either. */
function periodEnd(sub: Stripe.Subscription): string | null {
  const top = unixToIso((sub as unknown as { current_period_end?: number }).current_period_end);
  if (top) return top;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  return unixToIso(item?.current_period_end);
}

/** Persist the current subscription state onto company_billing. */
async function applySubscription(companyId: string, sub: Stripe.Subscription) {
  const seatPrice = seatPriceId();
  const seatItem = seatPrice
    ? sub.items.data.find((i) => i.price?.id === seatPrice)
    : undefined;
  const tier = await companyTier(companyId);
  await upsertCompanyBilling(companyId, {
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    billed_tier: tier,
    seat_quantity: seatItem?.quantity ?? 0,
    current_period_end: periodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  });
}

async function handleEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const companyId = await resolveCompanyId(
        customerId,
        session.client_reference_id ?? session.metadata?.company_id ?? null,
      );
      if (!companyId) return null;

      // AI credit top-up (one-time payment): grant credits = quantity x per-unit.
      if (session.metadata?.kind === "ai_topup") {
        if (session.payment_status !== "paid") return companyId;
        const perUnit = Number(session.metadata?.credits_per_unit ?? 0) || 0;
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const qty = items.data.reduce((s, li) => s + (li.quantity ?? 0), 0);
        const credits = perUnit * qty;
        if (credits > 0) {
          const supabase = createServiceClient();
          await supabase.rpc("grant_ai_credits", {
            cid: companyId,
            amount: credits,
            p_reason: "topup",
            p_ref: session.id,
          });
          await writeAudit({
            companyId,
            action: "billing.ai_topup_purchased",
            entityType: "company",
            entityId: companyId,
            summary: `Purchased ${credits} AI credits`,
            metadata: { credits, session: session.id },
          });
        }
        return companyId;
      }

      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await applySubscription(companyId, sub);
      }
      await writeAudit({
        companyId,
        action: "billing.subscription_activated",
        entityType: "company",
        entityId: companyId,
        summary: "Subscription activated via checkout",
      });
      return companyId;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const companyId = await resolveCompanyId(customerId, sub.metadata?.company_id ?? null);
      if (!companyId) return null;
      await applySubscription(companyId, sub);
      if (event.type === "customer.subscription.deleted") {
        await writeAudit({
          companyId,
          action: "billing.subscription_cancelled",
          entityType: "company",
          entityId: companyId,
          summary: "Subscription cancelled",
        });
      }
      return companyId;
    }
    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      const companyId = await resolveCompanyId(customerId, null);
      if (!companyId) return null;
      const subId = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
      const subIdStr = typeof subId === "string" ? subId : subId?.id ?? null;
      if (subIdStr) {
        const sub = await stripe.subscriptions.retrieve(subIdStr);
        await applySubscription(companyId, sub);
      }
      if (event.type === "invoice.payment_failed") {
        await writeAudit({
          companyId,
          action: "billing.payment_failed",
          entityType: "company",
          entityId: companyId,
          summary: "An invoice payment failed",
        });
      }
      return companyId;
    }
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  // Fail CLOSED: never trust unsigned input.
  if (!secret || !stripe) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    console.error("[stripe] signature verification failed:", (e as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const claim = await claimEvent(event);
  if (claim === "skip") return NextResponse.json({ received: true, duplicate: true });

  try {
    const companyId = await handleEvent(stripe, event);
    await settleEvent(event.id, "processed", companyId);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe] handler failed:", (e as Error).message, event.type);
    await settleEvent(event.id, "failed", null, (e as Error).message);
    // 500 asks Stripe to retry; the retry will safely reprocess (idempotent).
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}

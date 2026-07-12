import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { diamondRatePence } from "@/lib/stripe/config";
import { writeAudit } from "@/lib/audit";

/**
 * Diamond usage invoicing. Diamond has no subscription and pays for usage only
 * (SMS + AI). On the 1st of each month this cron bills the JUST CLOSED calendar
 * month: it reads usage_monthly per Diamond company, records one billing_usage_runs
 * row per company per month per kind (the unique index makes it idempotent, so a
 * re-run never double-bills), creates a Stripe invoice item per kind, then
 * creates and finalises one invoice per company.
 *
 * Amount: units × diamondRatePence(kind) when a rate env is set, else the metered
 * cost_pence already recorded on the events (pass-through). The customer-facing
 * per-unit price is an OPEN decision (see lib/stripe/config diamondRatePence) and
 * must be confirmed before the first live Diamond invoice.
 *
 * Fails CLOSED: no CRON_SECRET in production returns 503. Scheduled in vercel.json.
 */

export const dynamic = "force-dynamic";

/** First day of the previous calendar month on the Europe/London calendar. */
function previousMonthLondon(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}-01`;
}

type UsageRow = { kind: "sms" | "ai"; units_sum: number; cost_pence_sum: number | null };

function amountPence(kind: "sms" | "ai", units: number, costPenceSum: number | null): number {
  const rate = diamondRatePence(kind);
  if (rate !== null) return Math.round(units * rate);
  return Math.round(Number(costPenceSum ?? 0));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const period = previousMonthLondon();

  // Diamond companies, and their Stripe customer ids (separate query to avoid
  // relying on PostgREST one-to-one embed inference).
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("tier", "diamond");
  const companyIds = (companies ?? []).map((c) => c.id);
  const customerByCompany = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: billingRows } = await supabase
      .from("company_billing")
      .select("company_id, stripe_customer_id")
      .in("company_id", companyIds);
    for (const b of billingRows ?? []) {
      if (b.stripe_customer_id) customerByCompany.set(b.company_id, b.stripe_customer_id);
    }
  }

  const results: { company: string; billed: number; skipped: number }[] = [];

  for (const c of companies ?? []) {
    const customerId = customerByCompany.get(c.id);
    if (!customerId) continue;

    const { data: usage } = await supabase
      .from("usage_monthly")
      .select("kind, units_sum, cost_pence_sum")
      .eq("company_id", c.id)
      .eq("month", period);
    const rows = (usage ?? []) as UsageRow[];

    let billed = 0;
    let skipped = 0;
    let createdAnyItem = false;

    for (const row of rows) {
      const units = Number(row.units_sum ?? 0);
      if (units <= 0) continue;
      const amount = amountPence(row.kind, units, row.cost_pence_sum);
      if (amount <= 0) continue;

      // Claim: one run per company/month/kind. 23505 => already billed, skip.
      const { error: claimErr } = await supabase.from("billing_usage_runs").insert({
        company_id: c.id,
        period_month: period,
        kind: row.kind,
        units,
        amount_pence: amount,
      });
      if (claimErr) {
        if (claimErr.code === "23505") {
          skipped++;
          continue;
        }
        console.error("[stripe-usage] claim failed:", claimErr.message);
        continue;
      }

      try {
        const item = await stripe.invoiceItems.create({
          customer: customerId,
          amount,
          currency: "gbp",
          description: `${row.kind === "sms" ? "SMS" : "AI"} usage, ${period.slice(0, 7)} (${units} ${row.kind === "sms" ? "segments" : "tokens"})`,
          metadata: { company_id: c.id, period_month: period, kind: row.kind },
        });
        await supabase
          .from("billing_usage_runs")
          .update({ stripe_invoice_item_id: item.id })
          .eq("company_id", c.id)
          .eq("period_month", period)
          .eq("kind", row.kind);
        createdAnyItem = true;
        billed++;
      } catch (e) {
        // Roll back the claim so a re-run retries this kind.
        await supabase
          .from("billing_usage_runs")
          .delete()
          .eq("company_id", c.id)
          .eq("period_month", period)
          .eq("kind", row.kind);
        console.error("[stripe-usage] invoice item failed:", (e as Error).message);
      }
    }

    if (createdAnyItem) {
      try {
        const invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: "charge_automatically",
          auto_advance: true,
          description: `Usage for ${period.slice(0, 7)}`,
          metadata: { company_id: c.id, period_month: period },
        });
        // finalize so it charges the card on file (auto_advance handles progression).
        if (invoice.id) await stripe.invoices.finalizeInvoice(invoice.id);
        await writeAudit({
          companyId: c.id,
          action: "billing.usage_invoiced",
          entityType: "company",
          entityId: c.id,
          summary: `Invoiced Diamond usage for ${period.slice(0, 7)}`,
          metadata: { period_month: period, lines: billed },
        });
      } catch (e) {
        console.error("[stripe-usage] invoice create failed:", (e as Error).message);
      }
    }

    results.push({ company: c.name ?? c.id, billed, skipped });
  }

  return NextResponse.json({ period, companies: results });
}

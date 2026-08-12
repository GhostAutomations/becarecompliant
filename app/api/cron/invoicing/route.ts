import { NextRequest, NextResponse } from "next/server";
import { runRecurringInvoices, runOverdueReminders } from "@/lib/invoicing/cron";
import { reconcileBranchBilling } from "@/lib/billing/stripe-sync";

/**
 * Daily invoicing automation: draft due recurring invoices, then email overdue
 * reminders. Fails CLOSED in production without CRON_SECRET (503); wrong secret
 * is 401. Vercel sends "Authorization: Bearer <CRON_SECRET>". Public path (no
 * user session): the secret is the auth.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recurring = await runRecurringInvoices();
  const reminders = await runOverdueReminders();
  // Extra branch billing (THE LIST item 16). Reconciled rather than hooked, because nothing in
  // the product creates a branch: every extra branch on Acme was added straight in SQL, so a
  // hook would never fire and would look built while collecting nothing. This is our own
  // subscription revenue, not a customer's invoice, but it is billing and this is the daily
  // billing job, so it lives here rather than in a cron of its own.
  const branches = await reconcileBranchBilling();
  return NextResponse.json({ recurring, reminders, branches });
}

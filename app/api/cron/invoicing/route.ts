import { NextRequest, NextResponse } from "next/server";
import { runRecurringInvoices, runOverdueReminders } from "@/lib/invoicing/cron";

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
  return NextResponse.json({ recurring, reminders });
}

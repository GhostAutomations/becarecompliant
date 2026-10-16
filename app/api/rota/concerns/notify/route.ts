import { NextResponse } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { emailConcernNotifications } from "@/lib/rota/concern-email";

/**
 * The carer's phone calls this after a concern is accepted (Rota and Visits Stage 5): sends the
 * concern emails for the caller's own company that are due and not yet sent. Signed in and module
 * on only; it sends nothing anyone could not already be sent, each once.
 */
export async function POST() {
  const { profile } = await requireCompany();
  if (!profile.company_id) return NextResponse.json({ error: "No company." }, { status: 400 });
  if (!moduleOnInRow(await getCompanyRow(profile.company_id), "rota_visits")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const sent = await emailConcernNotifications(profile.company_id);
  return NextResponse.json({ sent });
}

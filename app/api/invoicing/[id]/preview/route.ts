import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import { getInvoice, getInvoicingConfig, getCompanyName, londonToday } from "@/lib/invoicing/data";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { renderInvoicePdf } from "@/lib/invoicing/pdf";
import { asItWillBeSent, inlineDisposition, previewFileName } from "@/lib/invoicing/preview";
import { INVOICING_ROLES } from "@/lib/invoicing/types";

/**
 * PREVIEW OF A DRAFT INVOICE (Phil, 2026-10-13, all companies). The Preview button opens this in a
 * new tab. It is the real invoice PDF, from the same generator Send and Download use, drawn as Send
 * will stamp it (lib/invoicing/preview.ts), with "Draft" where the number goes.
 *
 * It only READS: no invoice number, no change to number_seq, status or sent_at, no email, no stored
 * file, no Evidence. The one write is the audit line, as for any document download.
 *
 * The "draft has no PDF" rule (2026-08-01) still holds for Download PDF; this preview is the one
 * way to see a draft, and it can never read as a numbered invoice.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await ctx.params;
  const companyId = profile.company_id;
  if (!companyId) return new Response("No company", { status: 403 });
  // The same roles as the invoice page (requireInvoicing), enforced here as well as by RLS.
  if (!INVOICING_ROLES.includes(profile.role)) {
    return new Response("You do not have permission to see invoices.", { status: 403 });
  }
  if (!(await featureEnabled(companyId, "invoicing"))) {
    return new Response("Invoicing is a Pro feature.", { status: 403 });
  }

  const inv = await getInvoice(id);
  if (!inv || inv.company_id !== companyId) {
    return new Response("Invoice not found", { status: 404 });
  }
  // A sent invoice has its real PDF already.
  if (inv.status !== "draft") {
    return Response.redirect(new URL(`/api/invoicing/${inv.id}/pdf`, req.url), 303);
  }

  const [config, companyName, logo] = await Promise.all([
    getInvoicingConfig(companyId),
    getCompanyName(companyId),
    getCompanyLogoDataUrl(companyId),
  ]);
  const today = londonToday();
  const buffer = await renderInvoicePdf(asItWillBeSent(inv, config, today), config, companyName, today, logo);

  const billTo = inv.bill_to_name ?? inv.client_name;
  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_previewed",
    entityType: "invoice",
    entityId: inv.id,
    summary: `Previewed draft invoice for ${billTo} as PDF`,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inlineDisposition(previewFileName(billTo)),
      "Cache-Control": "no-store",
    },
  });
}

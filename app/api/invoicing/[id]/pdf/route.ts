import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { writeAudit } from "@/lib/audit";
import { getInvoice, getInvoicingConfig, getCompanyName, londonToday } from "@/lib/invoicing/data";
import { renderInvoicePdf } from "@/lib/invoicing/pdf";

/** Branded invoice PDF. Manager+ RLS lets the invoice load; Pro gates the export. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await ctx.params;
  if (!profile.company_id) return new Response("No company", { status: 403 });
  if (!(await featureEnabled(profile.company_id, "invoicing"))) {
    return new Response("Invoicing is a Pro feature.", { status: 403 });
  }

  const inv = await getInvoice(id);
  if (!inv || inv.company_id !== profile.company_id) {
    return new Response("Invoice not found", { status: 404 });
  }
  const [config, companyName] = await Promise.all([
    getInvoicingConfig(profile.company_id),
    getCompanyName(profile.company_id),
  ]);

  const buffer = await renderInvoicePdf(inv, config, companyName, londonToday());

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invoicing.invoice_downloaded",
    entityType: "invoice",
    entityId: inv.id,
    summary: `Downloaded invoice ${inv.number ?? "(draft)"} as PDF`,
  });

  const filename = `invoice-${(inv.number ?? "draft").replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

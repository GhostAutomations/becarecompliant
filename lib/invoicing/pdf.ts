import "server-only";
import { renderReportPdf, type ReportDoc, type ReportBlock } from "@/lib/export/pdf";
import { formatMoney, displayStatus, STATUS_LABEL, type InvoicingConfig } from "./types";
import type { InvoiceDetail } from "./data";

const INVOICE_TO_LABEL: Record<string, string> = {
  service_user: "the service user",
  nhs: "NHS",
  solicitor: "solicitor",
  next_of_kin: "next of kin",
  other: "other",
};

/** Build the branded invoice as a PDF buffer, reusing the shared report engine. */
export async function renderInvoicePdf(
  inv: InvoiceDetail,
  config: InvoicingConfig,
  companyName: string,
  today: string,
): Promise<Buffer> {
  const ds = displayStatus(inv.status, inv.due_date, today);

  const meta = [
    { label: "From", value: companyName },
    { label: "Bill to", value: inv.bill_to_name ?? inv.client_name },
    { label: "Invoice to", value: INVOICE_TO_LABEL[inv.invoice_to ?? "service_user"] },
    { label: "Issued", value: inv.issue_date ?? "Not set" },
    { label: "Due", value: inv.due_date ?? "Not set" },
    { label: "Status", value: STATUS_LABEL[ds] },
  ];
  if (config.vat_enabled && inv.vat_number_snapshot) {
    meta.push({ label: "VAT number", value: inv.vat_number_snapshot });
  }

  const blocks: ReportBlock[] = [];

  if (inv.bill_to_address || inv.bill_to_email || inv.bill_to_phone) {
    const parts = [inv.bill_to_address, inv.bill_to_email, inv.bill_to_phone].filter(Boolean).join("  ·  ");
    blocks.push({ kind: "paragraph", text: parts });
  }

  blocks.push({
    kind: "table",
    columns: [
      { header: "Description", width: "52%" },
      { header: "Qty", width: "12%", align: "right" },
      { header: "Unit", width: "18%", align: "right" },
      { header: "Amount", width: "18%", align: "right" },
    ],
    rows: inv.lines.map((l) => [
      { text: l.description },
      { text: String(l.quantity) },
      { text: formatMoney(l.unit_price_pence) },
      { text: formatMoney(l.line_total_pence) },
    ]),
    emptyText: "No lines on this invoice.",
  });

  const totalsRows: { text: string; strong?: boolean }[][] = [
    [{ text: "Subtotal" }, { text: formatMoney(inv.subtotal_pence) }],
  ];
  if (inv.vat_applied) totalsRows.push([{ text: "VAT" }, { text: formatMoney(inv.vat_pence) }]);
  totalsRows.push([{ text: "Total", strong: true }, { text: formatMoney(inv.total_pence), strong: true }]);
  blocks.push({
    kind: "table",
    columns: [
      { header: "Summary", width: "72%" },
      { header: "", width: "28%", align: "right" },
    ],
    rows: totalsRows,
  });

  if (inv.notes) blocks.push({ kind: "paragraph", text: inv.notes });
  if (config.payment_details) {
    blocks.push({ kind: "heading", text: "Payment details" });
    blocks.push({ kind: "paragraph", text: config.payment_details });
  }
  if (config.invoice_footer) blocks.push({ kind: "paragraph", text: config.invoice_footer });

  const doc: ReportDoc = {
    title: inv.number ? `Invoice ${inv.number}` : "Draft invoice",
    subtitle: companyName,
    reference: inv.number ?? undefined,
    meta,
    blocks,
    footerNote: config.vat_enabled ? undefined : "Care services are provided under the VAT welfare exemption.",
  };
  return renderReportPdf(doc);
}

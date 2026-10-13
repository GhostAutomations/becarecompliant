/**
 * Be Care Compliant — the draft invoice PREVIEW (Phil, 2026-10-13, all companies).
 *
 * The preview is the real invoice PDF (renderInvoicePdf, the generator Send and Download use),
 * drawn from the draft as Send WILL stamp it, so what Phil previews is what the client gets. Send
 * (invoicing_send_invoice) fills four things a draft can lack; the preview fills them the same way,
 * in memory only. It never gives out a number: the number spot reads "Draft".
 *
 *   issue date           the draft's, or today
 *   due date             the draft's, or today + the payment terms (14 days when unset)
 *   VAT applied          the company's VAT setting
 *   VAT number           the company's VAT number when VAT is on
 *
 * Pure and importless, so node --test runs it.
 */

type Previewable = {
  issue_date: string | null;
  due_date: string | null;
  vat_applied: boolean;
  vat_number_snapshot: string | null;
};

type SendSettings = {
  vat_enabled: boolean;
  vat_number: string | null;
  default_payment_terms_days: number | null;
};

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The draft as Send will stamp it (the same four rules as invoicing_send_invoice). Number and
 *  status are left alone: still a draft, still no number. */
export function asItWillBeSent<T extends Previewable>(inv: T, cfg: SendSettings, todayIso: string): T {
  return {
    ...inv,
    issue_date: inv.issue_date ?? todayIso,
    due_date: inv.due_date ?? isoAddDays(todayIso, cfg.default_payment_terms_days ?? 14),
    vat_applied: cfg.vat_enabled,
    vat_number_snapshot: cfg.vat_enabled ? cfg.vat_number : null,
  };
}

/** "Draft invoice for Jane Smith.pdf": no dashes, nothing a file name cannot hold. */
export function previewFileName(billTo: string | null | undefined): string {
  const name = String(billTo ?? "")
    .replace(/[‐-―−-]/g, " ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return name ? `Draft invoice for ${name}.pdf` : "Draft invoice.pdf";
}

/** The Content-Disposition header: inline, with a plain fallback and the full name for browsers
 *  that read it. */
export function inlineDisposition(fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim() || "Draft invoice.pdf";
  return `inline; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

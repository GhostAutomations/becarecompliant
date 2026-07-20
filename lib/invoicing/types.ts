/**
 * Invoicing shared types and PURE helpers (no server-only imports, so client
 * components can use them too). Money is stored and passed as integer pence.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type DisplayStatus = InvoiceStatus | "overdue";

/** Roles that can see and use Invoicing: Branch Manager and above. */
export const INVOICING_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

export type InvoicingConfig = {
  company_id: string;
  vat_enabled: boolean;
  vat_number: string | null;
  number_prefix: string;
  number_start: number;
  default_payment_terms_days: number;
  payment_details: string | null;
  invoice_footer: string | null;
  overdue_reminders_enabled: boolean;
};

export const DEFAULT_INVOICING_CONFIG: Omit<InvoicingConfig, "company_id"> = {
  vat_enabled: false,
  vat_number: null,
  number_prefix: "INV-",
  number_start: 1,
  default_payment_terms_days: 14,
  payment_details: null,
  invoice_footer: null,
  overdue_reminders_enabled: false,
};

/** £ from integer pence, always 2dp. */
export function formatMoney(pence: number): string {
  return `£${(Math.round(pence) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a "12.50" pounds string into integer pence. Returns 0 for junk. */
export function poundsToPence(input: string): number {
  const n = Number(String(input).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Overdue is derived, never stored: a sent, unpaid invoice past its due date. */
export function displayStatus(
  status: InvoiceStatus,
  dueDate: string | null,
  todayIso: string,
): DisplayStatus {
  if (status === "sent" && dueDate && dueDate < todayIso) return "overdue";
  return status;
}

export const STATUS_PILL: Record<DisplayStatus, string> = {
  draft: "pill-neutral",
  sent: "pill-amber",
  overdue: "pill-red",
  paid: "pill-green",
  void: "pill-neutral",
};

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

/** Compute line and invoice totals from raw lines. VAT only applies when the
 *  company has VAT enabled; each line carries its own rate (usually the same). */
export function computeTotals(
  lines: { quantity: number; unit_price_pence: number; vat_rate: number }[],
  vatEnabled: boolean,
): { subtotalPence: number; vatPence: number; totalPence: number } {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const lineTotal = Math.round(l.quantity * l.unit_price_pence);
    subtotal += lineTotal;
    if (vatEnabled) vat += Math.round((lineTotal * (l.vat_rate || 0)) / 100);
  }
  return { subtotalPence: subtotal, vatPence: vat, totalPence: subtotal + vat };
}

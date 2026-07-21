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
  company_number: string | null;
  reply_to_email: string | null;
  overdue_reminders_enabled: boolean;
  rate_care_pence: number;
  rate_sit_pence: number;
  rate_overnight_pence: number;
  rate_sleep_pence: number;
  rate_shopping_pence: number;
  rate_cleaning_pence: number;
  rate_care_fixed_pence: number;
  rate_sit_fixed_pence: number;
  rate_overnight_fixed_pence: number;
  rate_sleep_fixed_pence: number;
  rate_shopping_fixed_pence: number;
  rate_cleaning_fixed_pence: number;
};

export const DEFAULT_INVOICING_CONFIG: Omit<InvoicingConfig, "company_id"> = {
  vat_enabled: false,
  vat_number: null,
  number_prefix: "INV-",
  number_start: 1,
  default_payment_terms_days: 14,
  payment_details: null,
  invoice_footer: null,
  company_number: null,
  reply_to_email: null,
  overdue_reminders_enabled: false,
  rate_care_pence: 0,
  rate_sit_pence: 0,
  rate_overnight_pence: 0,
  rate_sleep_pence: 0,
  rate_shopping_pence: 0,
  rate_cleaning_pence: 0,
  rate_care_fixed_pence: 0,
  rate_sit_fixed_pence: 0,
  rate_overnight_fixed_pence: 0,
  rate_sleep_fixed_pence: 0,
  rate_shopping_fixed_pence: 0,
  rate_cleaning_fixed_pence: 0,
};

/** The six hourly service rates the company sets in Settings. */
export const INVOICE_SERVICES = [
  { key: "care", label: "Care" },
  { key: "sit", label: "Sit" },
  { key: "overnight", label: "Overnight" },
  { key: "sleep", label: "Sleep" },
  { key: "shopping", label: "Shopping" },
  { key: "cleaning", label: "Cleaning" },
] as const;

export type ServiceKey = (typeof INVOICE_SERVICES)[number]["key"];

/** Single handed is the base hourly rate; double handed (two carers) is twice it. */
export const HANDED = [
  { key: "single", label: "Single Handed", multiplier: 1 },
  { key: "double", label: "Double Handed", multiplier: 2 },
] as const;

export function serviceRatePence(config: InvoicingConfig, service: ServiceKey): number {
  return config[`rate_${service}_pence` as keyof InvoicingConfig] as number;
}

export function serviceFixedPence(config: InvoicingConfig, service: ServiceKey): number {
  return config[`rate_${service}_fixed_pence` as keyof InvoicingConfig] as number;
}

export type InvoiceTemplate = { description: string; unit_price_pence: number };

/** Derived line templates: each service x single/double handed (hourly), plus a
 *  Fixed line per service when a fixed rate is set. */
export function serviceTemplates(config: InvoicingConfig): InvoiceTemplate[] {
  const out: InvoiceTemplate[] = [];
  for (const s of INVOICE_SERVICES) {
    const base = serviceRatePence(config, s.key);
    for (const h of HANDED) {
      out.push({ description: `${s.label} - ${h.label}`, unit_price_pence: Math.round(base * h.multiplier) });
    }
    const fixed = serviceFixedPence(config, s.key);
    if (fixed > 0) out.push({ description: `${s.label} - Fixed`, unit_price_pence: fixed });
  }
  return out;
}

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

/** Advance a run date by a schedule cadence (weekly = 7 days, monthly = calendar
 *  months with end-of-month clamping). Optionally snap to a chosen day: weekly to
 *  a day of week (0 = Monday .. 6 = Sunday) within the resulting week, monthly to
 *  a day of month (1..28). Pure, shared by the action and the cron. */
export function advanceRunDate(
  iso: string,
  frequency: string,
  interval: number,
  opts?: { dayOfWeek?: number | null; dayOfMonth?: number | null },
): string {
  const n = Math.max(1, interval);
  const [y, m, d] = iso.split("-").map(Number);
  if (frequency === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 7 * n);
    const dow = opts?.dayOfWeek;
    if (dow != null && dow >= 0 && dow <= 6) {
      // Snap to the chosen weekday within the same Mon..Sun week.
      const cur = (dt.getUTCDay() + 6) % 7; // Mon=0
      dt.setUTCDate(dt.getUTCDate() + (dow - cur));
    }
    return dt.toISOString().slice(0, 10);
  }
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const dom = opts?.dayOfMonth;
  const wanted = dom != null && dom >= 1 && dom <= 28 ? dom : d;
  target.setUTCDate(Math.min(wanted, lastDay));
  return target.toISOString().slice(0, 10);
}

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

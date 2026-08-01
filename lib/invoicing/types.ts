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
  from_address: string | null;
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
  from_address: null,
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

/**
 * A UNIT PRICE, printed at whatever precision it actually has.
 *
 * Ordinary money gets two decimals, always. A unit price is different: a quarter hour of a
 * £25.50 hourly rate is £6.375, and printing it as £6.38 puts a figure on the invoice that does
 * not multiply out (7 x £6.38 = £44.66, while the amount is £44.63). Phil asked about exactly
 * that line on 2026-08-01. So a price with a fraction of a penny in it shows the fraction, and
 * one without still shows the plain £12.75 a reader expects.
 *
 * FOUR DECIMALS, not three. An hourly rate is any whole number of pence, and an odd one quartered
 * lands on a quarter penny: £22.75 an hour makes a 15m visit £5.6875. Printing that as £5.688
 * puts the invoice a penny out on seven visits, which is the same fault this exists to remove,
 * one order of magnitude down. Units are only ever quarters, halves, three quarters or whole
 * hours, so four is exactly enough and never arbitrary.
 *
 * `exact` is null on lines written before migration 0163. WITHOUT a fallback those print an em
 * dash, which is deliberate: they were raised when no document showed a unit price at all, and
 * printing the rounded figure now would put the very contradiction Phil asked about onto an
 * invoice a client already holds, the moment somebody pressed Resend. Internal screens pass the
 * rounded figure as a fallback, because there a blank helps nobody.
 */
/**
 * Should this invoice show a Unit price column at all?
 *
 * Only when at least one line has a price worth printing. An invoice raised before migration
 * 0163 has none, and a whole column of em dashes is worse than no column: it draws the eye to
 * an absence and tells the reader nothing. Hiding it means such an invoice renders exactly as it
 * always did, including a PDF regenerated months later by Resend.
 *
 * ONE helper, used by the page and the PDF, so the two cannot come to different conclusions
 * about the same invoice.
 */
export function showsUnitPrice(lines: { unit_price_exact: number | null }[]): boolean {
  // Loose equality on purpose: a row from a narrowed select has the property MISSING rather than
  // null, and `undefined !== null` would switch the column back on and fill it with em dashes.
  return lines.some((l) => l.unit_price_exact != null);
}

export function formatUnitPrice(exact: number | null, fallbackPence?: number): string {
  const pence = exact ?? fallbackPence;
  if (pence === undefined || pence === null) return "—";
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
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

/** The period a recurring run bills FOR. Phil chose IN ARREARS (2026-07-27): a run
 *  on a given date bills the cadence that has just finished, so you invoice care
 *  actually delivered. A 4 weekly schedule running Mon 17 Aug bills the 28 days
 *  ending Sun 16 Aug; a monthly schedule bills the month just gone. */
export function billingPeriodFor(
  runDateIso: string,
  frequency: string,
  interval: number,
): { from: string; to: string } {
  const n = Math.max(1, interval);
  const [y, m, d] = runDateIso.split("-").map(Number);
  const endDt = new Date(Date.UTC(y, m - 1, d));
  endDt.setUTCDate(endDt.getUTCDate() - 1);
  const to = endDt.toISOString().slice(0, 10);

  if (frequency === "weekly") {
    const startDt = new Date(Date.UTC(y, m - 1, d));
    startDt.setUTCDate(startDt.getUTCDate() - 7 * n);
    return { from: startDt.toISOString().slice(0, 10), to };
  }
  const startDt = new Date(Date.UTC(y, m - 1 - n, 1));
  const lastOfStart = new Date(
    Date.UTC(startDt.getUTCFullYear(), startDt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  startDt.setUTCDate(Math.min(d, lastOfStart));
  return { from: startDt.toISOString().slice(0, 10), to };
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

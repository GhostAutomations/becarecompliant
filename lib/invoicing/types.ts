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
  /** The old free text bank details. Printed only while the four fields below are all empty. */
  payment_details: string | null;
  /** Bank details as four fields (Phil, 2026-10-13; 0464). */
  bank_account_name: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_sort_code: string | null;
  invoice_footer: string | null;
  company_number: string | null;
  reply_to_email: string | null;
  from_address: string | null;
  overdue_reminders_enabled: boolean;
  /** Copy (CC) every invoice email to reply_to_email (Phil, 2026-10-13; 0465). */
  cc_reply_to: boolean;
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
  bank_account_name: null,
  bank_name: null,
  bank_account_number: null,
  bank_sort_code: null,
  invoice_footer: null,
  company_number: null,
  reply_to_email: null,
  from_address: null,
  overdue_reminders_enabled: false,
  cc_reply_to: false,
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
      out.push({ description: `${s.label}, ${h.label}`, unit_price_pence: Math.round(base * h.multiplier) });
    }
    const fixed = serviceFixedPence(config, s.key);
    if (fixed > 0) out.push({ description: `${s.label}, fixed`, unit_price_pence: fixed });
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
 * Does this line's own arithmetic hold? Quantity times the unit price, equal to the amount.
 *
 * THE RULE THAT REPLACED A DATABASE COLUMN. Every line written from 2026-08-01 is charged at
 * quantity x the printed unit price, so this is always true of them. Lines written before that
 * were charged at the exact hourly rate and rounded once at the end, so a quarter hour line
 * comes to £44.63 against a printed £6.38, three pence adrift.
 *
 * Deciding it from the line ITSELF rather than from a flag means the invoice can never print a
 * price that argues with its own amount, whatever wrote the row and whenever. It also correctly
 * prints the old lines that DO hold: 30m and 1hr divide exactly out of an hourly rate and were
 * never wrong.
 */
export function lineAddsUp(line: {
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
}): boolean {
  return Math.round(line.quantity * line.unit_price_pence) === line.line_total_pence;
}

/**
 * Should this invoice show a Unit price column at all?
 *
 * EVERY line, not some. An invoice is one document: a table where half the rows carry a price
 * and half carry an em dash invites the exact question this was meant to answer, and it reaches
 * clients who already hold the invoice, because the PDF is rendered live on every download and
 * every Resend. Caught by review, which found that an invoice from before 2026-08-01 containing
 * a single 30m or 1hr line (the ordinary case, since those divide exactly out of an hourly rate)
 * would have grown a half filled column it was never sent with.
 *
 * So: every line multiplies out and the column appears, or it does not and the invoice renders
 * exactly as it always did. Anything raised from 2026-08-01 satisfies it by construction.
 *
 * ONE helper, used by the page and the PDF, so the two cannot come to different conclusions
 * about the same invoice.
 */
export function showsUnitPrice(
  lines: { quantity: number; unit_price_pence: number; line_total_pence: number }[],
): boolean {
  return lines.length > 0 && lines.every(lineAddsUp);
}

/**
 * THE LINE DATE (Phil, 2026-10-13, all companies): an optional day per line, printed in a Date
 * column left of Service. Popup "Optional, column shows when used": the column appears only when at
 * least one line has a date, so every invoice already sent prints exactly as it was. ONE helper for
 * the page and the PDF.
 */
export function showsServiceDate(lines: { service_date?: string | null }[]): boolean {
  return lines.some((l) => Boolean(l.service_date));
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The day and the date apart, so the page and the PDF can set the day in a fixed slot and every
 *  date lines up under the one above (Phil, 2026-10-13: "Day then tab space then the date so all
 *  dates go down in a line"). Null for a line without a date. */
export function serviceDateParts(iso: string | null | undefined): { day: string; date: string } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-");
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return { day: WEEKDAY_SHORT[day], date: `${d}/${m}/${y}` };
}

/** "Mon 05/10/2026" (popup: day name and UK date); "" for a line without a date. */
export function formatServiceDate(iso: string | null | undefined): string {
  const p = serviceDateParts(iso);
  return p ? `${p.day} ${p.date}` : "";
}

/**
 * THE BANK DETAILS (Phil, 2026-10-13): four fields, printed as a label, a gap, then the value, so
 * the values line up. Labels exactly as Phil wrote them, with a colon (popup). Only the fields
 * filled in are printed. Null when all four are empty: the invoice then prints the old free text,
 * so no company's invoice goes blank before it fills the fields in.
 */
export const BANK_FIELDS = [
  { key: "bank_account_name", label: "Account Name" },
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_number", label: "Account No" },
  { key: "bank_sort_code", label: "Sort Code" },
] as const;

export function bankDetailRows(cfg: {
  bank_account_name?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_sort_code?: string | null;
}): { label: string; value: string }[] | null {
  const rows = BANK_FIELDS.map((f) => ({ label: `${f.label}:`, value: String(cfg[f.key] ?? "").trim() })).filter((r) => r.value);
  return rows.length ? rows : null;
}

/** A unit price, or an em dash when this line's figures would not stand being multiplied out.
 *  With the every rule above the dash is unreachable from the invoice table, and it stays as the
 *  guard: nothing may print a price that argues with its own amount. */
export function formatUnitPrice(line: {
  quantity: number;
  unit_price_pence: number;
  line_total_pence: number;
}): string {
  return lineAddsUp(line) ? formatMoney(line.unit_price_pence) : "—";
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

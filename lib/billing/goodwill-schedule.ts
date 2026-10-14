/**
 * Be Care Compliant — when goodwill credits fall due (Phil, 2026-10-14; docs/decisions/goodwill-credits.md).
 *
 * Pure and import free so node --test can load it. The database does the granting
 * (public.grant_due_goodwill, 0472) with the same rule; this draws the dates for the Founder's
 * summary and the "next grant" column, and the tests pin the rule down.
 *
 *  - One off: once, on the start date.
 *  - Weekly: the start date, then every 7 days.
 *  - Monthly: the start date, then the same day each month; a day the month does not have (the
 *    31st in April) becomes that month's last day, and the next month goes back to the 31st.
 *  - Ends after a number of times, or on an end date (a grant due ON the end date is given).
 */

export type GoodwillFrequency = "once" | "weekly" | "monthly";

function parse(iso: string): { y: number; m: number; d: number } {
  return { y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) };
}
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The due date of grant number n (0 is the start date). */
export function goodwillDueDate(start: string, frequency: GoodwillFrequency, n: number): string {
  const { y, m, d } = parse(start);
  if (frequency === "once" || n === 0) return start;
  if (frequency === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7 * n));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export type GoodwillPlan = {
  start: string;
  frequency: GoodwillFrequency;
  /** Weekly or monthly: how many times, or ... */
  times?: number | null;
  /** ... the last date a grant may fall on. */
  endDate?: string | null;
};

/** Every due date of the plan, in order (capped at 520 so a mistake cannot run away). */
export function goodwillDates(plan: GoodwillPlan): string[] {
  if (plan.frequency === "once") return [plan.start];
  const out: string[] = [];
  for (let n = 0; n < 520; n++) {
    if (plan.times != null && n >= plan.times) break;
    const due = goodwillDueDate(plan.start, plan.frequency, n);
    if (plan.endDate && due > plan.endDate) break;
    if (plan.times == null && !plan.endDate) break;
    out.push(due);
  }
  return out;
}

/** The plan in one plain sentence for the confirm step, e.g. "every month, 6 times, starting ...". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function longDate(iso: string): string {
  const { y, m, d } = parse(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function goodwillSummary(input: {
  company: string;
  sms: number;
  ai: number;
  plan: GoodwillPlan;
}): string {
  const what = [input.sms > 0 ? `${input.sms.toLocaleString("en-GB")} SMS` : "", input.ai > 0 ? `${input.ai.toLocaleString("en-GB")} AI` : ""]
    .filter(Boolean)
    .join(" and ");
  const dates = goodwillDates(input.plan);
  if (input.plan.frequency === "once") {
    return `${input.company} will get ${what} credits once, on ${longDate(input.plan.start)}.`;
  }
  const every = input.plan.frequency === "weekly" ? "every week" : "every month";
  const howLong = input.plan.times != null ? `${input.plan.times} ${input.plan.times === 1 ? "time" : "times"}` : `until ${longDate(input.plan.endDate ?? input.plan.start)}`;
  const last = dates.length > 0 ? ` (last grant ${longDate(dates[dates.length - 1])})` : "";
  return `${input.company} will get ${what} credits ${every}, ${howLong}, starting ${longDate(input.plan.start)}${last}.`;
}

/** Why the Founder gave them. Founder only: never shown to the customer. */
export const GOODWILL_REASONS = {
  complaint: "Complaint goodwill",
  signup_deal: "Sign up deal",
  promotion: "Promotion",
  other: "Other",
} as const;
export type GoodwillReason = keyof typeof GOODWILL_REASONS;

export const GOODWILL_FREQUENCIES: Record<GoodwillFrequency, string> = {
  once: "One off",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** The next due date not yet given, or null when there is none left. */
export function goodwillNextDate(plan: GoodwillPlan, given: number): string | null {
  return goodwillDates(plan)[given] ?? null;
}

export type GoodwillInput = {
  companyId: string;
  sms: number;
  ai: number;
  frequency: GoodwillFrequency;
  start: string;
  times: number | null;
  endDate: string | null;
  reason: GoodwillReason;
  note: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function credits(raw: string, what: string): number | string {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return 0;
  if (!/^\d+$/.test(t)) return `${what} credits must be a whole number (0 or more).`;
  const n = Number(t);
  if (n > 100000) return `${what} credits can be at most 100,000.`;
  return n;
}

/**
 * The New grant form, checked. The same rules hold in the database (create_goodwill_grant and the
 * table's checks); this gives the Founder a plain message first. `today` is London's date.
 */
export function parseGoodwillForm(
  f: Record<string, string>,
  today: string,
): { ok: true; value: GoodwillInput } | { ok: false; error: string } {
  const get = (k: string) => (f[k] ?? "").trim();
  const companyId = get("company_id");
  if (!UUID.test(companyId)) return { ok: false, error: "Choose the company." };
  const sms = credits(get("sms"), "SMS");
  if (typeof sms === "string") return { ok: false, error: sms };
  const ai = credits(get("ai"), "AI");
  if (typeof ai === "string") return { ok: false, error: ai };
  if (sms + ai <= 0) return { ok: false, error: "Give at least one SMS or AI credit." };
  const frequency = get("frequency") as GoodwillFrequency;
  if (!(frequency in GOODWILL_FREQUENCIES)) return { ok: false, error: "Choose how often." };
  const start = get("start");
  if (!ISO.test(start)) return { ok: false, error: "Choose the start date." };
  if (start < today) return { ok: false, error: "The start date cannot be in the past." };
  let times: number | null = null;
  let endDate: string | null = null;
  if (frequency !== "once") {
    if (get("how_long") === "end") {
      endDate = get("end");
      if (!ISO.test(endDate)) return { ok: false, error: "Choose the end date." };
      if (endDate < start) return { ok: false, error: "The end date cannot be before the start date." };
      if (goodwillDates({ start, frequency, endDate }).length >= 520) return { ok: false, error: "That end date is too far away. Keep it to 520 grants or fewer." };
    } else {
      const t = get("times");
      if (!/^\d+$/.test(t) || +t < 1 || +t > 520) return { ok: false, error: "Enter how many times, from 1 to 520." };
      times = +t;
    }
  }
  const reason = get("reason") as GoodwillReason;
  if (!(reason in GOODWILL_REASONS)) return { ok: false, error: "Choose the reason." };
  const note = get("note");
  if (note.length > 2000) return { ok: false, error: "Keep the private note to 2,000 characters." };
  return { ok: true, value: { companyId, sms, ai, frequency, start, times, endDate, reason, note: note || null } };
}

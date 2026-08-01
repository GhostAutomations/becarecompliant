/**
 * Shared care plan billing maths. Pure: no Supabase, no session, no side effects,
 * so BOTH the invoice builder (user session, RLS client) and the recurring cron
 * (service client, no session) expand a care plan the same way and agree to the
 * penny. Lifted out of invoice-actions.ts on 2026-07-27, when the recurring cron
 * was found still using the old rounded unit price maths that the builder had
 * moved off on 2026-07-21.
 */

import { INVOICE_SERVICES } from "./types";
import {
  unitPricePence,
  unitPriceExactPence,
  lineAmountPence,
  type ServiceRate,
} from "@/lib/service-users/care-plan-consts";

export type BuilderLine = {
  service: string;
  unit: string;
  handed: string;
  quantity: number;
  unit_price_pence: number;
  /** The unrounded unit price in pence: what the invoice prints, so the line multiplies out. */
  unit_price_exact: number;
  line_total_pence: number;
  description: string;
  period_start: string;
  period_end: string;
};

/** A care plan row as stored, carrying its version window. */
export type PlanEntryRow = {
  day_of_week: number;
  service: string;
  unit: string;
  handed: string;
  quantity: number;
  effective_from: string;
  effective_to: string | null;
};

type PlanEntry = Omit<PlanEntryRow, "effective_from" | "effective_to">;
type PlanVersion = { from: string; to: string | null; entries: PlanEntry[] };

export const HANDED_SUFFIX: Record<string, string> = {
  single: "Single Handed",
  double: "Double Handed",
};

export function addDaysUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Look a service's rates up out of an invoicing_config row. */
export function rateLookup(
  config: Record<string, unknown> | null | undefined,
): (label: string) => ServiceRate | undefined {
  const cfg = (config ?? {}) as Record<string, unknown>;
  return (label: string): ServiceRate | undefined => {
    const svc = INVOICE_SERVICES.find((s) => s.label === label);
    if (!svc) return undefined;
    return {
      label,
      hourly_pence: Number(cfg[`rate_${svc.key}_pence`] ?? 0),
      fixed_pence: Number(cfg[`rate_${svc.key}_fixed_pence`] ?? 0),
    };
  };
}

/**
 * Expand a care plan over a date range into invoice lines, BROKEN DOWN BY WEEK and
 * by CARE PLAN VERSION. The period is split into 7 day windows from the start date;
 * within a week, if a care plan change takes effect mid-week the week is further
 * split at the change date (a change on Thursday bills Mon..Wed on the old plan and
 * Thu..Sun on the new plan), each segment its own dated line group. Amounts are billed at the
 * exact rate, rounded only at the end, and each line carries the UNROUNDED unit price so the
 * finished invoice can print a figure that multiplies out (Phil, 2026-08-01).
 */
export function buildCarePlanLines(
  entries: PlanEntryRow[],
  config: Record<string, unknown> | null | undefined,
  from: string,
  to: string,
): BuilderLine[] {
  if (entries.length === 0) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return [];

  const rateFor = rateLookup(config);

  // Group entries into versions by effective range; find the version live on a day.
  const vmap = new Map<string, PlanVersion>();
  for (const e of entries) {
    const key = `${e.effective_from}|${e.effective_to ?? ""}`;
    let v = vmap.get(key);
    if (!v) {
      v = { from: e.effective_from, to: e.effective_to, entries: [] };
      vmap.set(key, v);
    }
    v.entries.push({
      day_of_week: e.day_of_week,
      service: e.service,
      unit: e.unit,
      handed: e.handed,
      quantity: e.quantity,
    });
  }
  const versions = [...vmap.values()];
  const versionForDay = (iso: string): PlanVersion | undefined =>
    versions.find((v) => v.from <= iso && (v.to === null || v.to >= iso));
  const versionKey = (iso: string): string => {
    const v = versionForDay(iso);
    return v ? `${v.from}|${v.to ?? ""}` : "none";
  };

  /** Bill one contiguous same-version segment [sStart, sEnd] as a dated line group. */
  function billSegment(sStart: string, sEnd: string, out: BuilderLine[]) {
    const v = versionForDay(sStart);
    if (!v) return;
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let d = new Date(`${sStart}T00:00:00Z`);
    const de = new Date(`${sEnd}T00:00:00Z`);
    let g = 0;
    while (d <= de && g < 8) {
      counts[(d.getUTCDay() + 6) % 7] += 1;
      d.setUTCDate(d.getUTCDate() + 1);
      g += 1;
    }
    const merged = new Map<string, BuilderLine>();
    for (const e of v.entries) {
      const occ = counts[e.day_of_week] ?? 0;
      const qty = occ * Number(e.quantity);
      if (qty <= 0) continue;
      const handed = e.handed === "double" ? "double" : "single";
      const key = `${e.service}|${e.unit}|${handed}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.line_total_pence = lineAmountPence(rateFor(e.service), e.unit, handed, existing.quantity);
      } else {
        merged.set(key, {
          service: e.service,
          unit: e.unit,
          handed,
          quantity: qty,
          unit_price_pence: unitPricePence(rateFor(e.service), e.unit, handed),
          unit_price_exact: unitPriceExactPence(rateFor(e.service), e.unit, handed),
          line_total_pence: lineAmountPence(rateFor(e.service), e.unit, handed, qty),
          description: `${e.service} - ${e.unit} (${HANDED_SUFFIX[handed]})`,
          period_start: sStart,
          period_end: sEnd,
        });
      }
    }
    out.push(...merged.values());
  }

  const out: BuilderLine[] = [];
  let weekStart = from;
  let weekGuard = 0;
  while (weekStart <= to && weekGuard < 60) {
    weekGuard += 1;
    const rawEnd = addDaysUtc(weekStart, 6);
    const weekEnd = rawEnd > to ? to : rawEnd;

    // Split the week into contiguous same-version segments, bill each separately.
    let segStart = weekStart;
    let curKey = versionKey(weekStart);
    let day = weekStart;
    let g = 0;
    while (g < 8) {
      const isLast = day === weekEnd;
      const nextDay = addDaysUtc(day, 1);
      const nextKey = isLast ? null : versionKey(nextDay);
      if (isLast || nextKey !== curKey) {
        billSegment(segStart, day, out);
        if (isLast) break;
        segStart = nextDay;
        curKey = nextKey!;
      }
      day = nextDay;
      g += 1;
    }
    weekStart = addDaysUtc(weekStart, 7);
  }
  return out;
}

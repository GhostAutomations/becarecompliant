/**
 * Be Care Compliant: call cancellation settings, the pure half (Rota and Visits Stage 7b part 2b,
 * Phil's popups 2026-10-17; docs/decisions/rota-visits.md, call cancellations 2 and 3, Stage 7b 6,
 * 9 and 16). Importless, so node --test runs it. The bounds match the checks on rota_cancel_rules
 * and rota_cancel_reasons (0510).
 */

export type CancelRule = { noticeHours: number; chargeHours: number; payHours: number };

/** Every branch starts here until the company changes it (decision 16). */
export const DEFAULT_CANCEL_RULE: CancelRule = { noticeHours: 48, chargeHours: 48, payHours: 48 };

export type RuleField = { key: keyof CancelRule; name: string; label: string; maxHours: number };

export const RULE_FIELDS: readonly RuleField[] = [
  { key: "noticeHours", name: "notice", label: "Notice needed", maxHours: 720 },
  { key: "chargeHours", name: "charge", label: "Still charged for", maxHours: 2016 },
  { key: "payHours", name: "pay", label: "Carer still paid for", maxHours: 2016 },
];

export type DurationUnit = "hours" | "days";

/** Hours shown the way people say them: days from 3 days up when whole, otherwise hours. */
export function splitHours(hours: number): { value: number; unit: DurationUnit } {
  if (hours >= 72 && hours % 24 === 0) return { value: hours / 24, unit: "days" };
  return { value: hours, unit: "hours" };
}

export function durationWords(hours: number): string {
  if (hours === 0) return "Not at all";
  const { value, unit } = splitHours(hours);
  return `${value.toLocaleString("en-GB")} ${value === 1 ? unit.slice(0, -1) : unit}`;
}

/** A posted rule: each field a whole number of hours or days, inside its bounds. */
export function parseRule(get: (name: string) => unknown): { rule: CancelRule } | { error: string } {
  const rule = { ...DEFAULT_CANCEL_RULE };
  for (const f of RULE_FIELDS) {
    const raw = String(get(`${f.name}_value`) ?? "").trim();
    const unit = String(get(`${f.name}_unit`) ?? "hours");
    const n = Number(raw);
    if (unit !== "hours" && unit !== "days") return { error: `${f.label}: choose hours or days.` };
    if (raw === "" || !Number.isInteger(n) || n < 0) return { error: `${f.label}: enter a whole number, 0 or more.` };
    const hours = unit === "days" ? n * 24 : n;
    if (hours > f.maxHours) return { error: `${f.label}: at most ${f.maxHours / 24} days.` };
    rule[f.key] = hours;
  }
  return { rule };
}

export type CancelReason = { id: string; code: string | null; label: string; chargeable: boolean; carerPaid: boolean; archivedAt: string | null };

/** A to Z with Other last (the Rota dropdown rule); archived ones after, A to Z. */
export function sortReasons<T extends { code: string | null; label: string; archivedAt: string | null }>(list: T[]): T[] {
  const rank = (r: T) => (r.archivedAt ? 2 : r.code === "other" ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }));
}

export function reasonLabelProblem(label: string): string | null {
  const t = label.replace(/\s+/g, " ").trim();
  if (!t) return "Write the reason.";
  if (t.length > 80) return "The reason is too long (80 characters at most).";
  return null;
}

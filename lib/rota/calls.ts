/**
 * Be Care Compliant: a service user's Care Schedule calls as the rota sees them (Rota and Visits
 * Stage 2, Phil 2026-10-15). Pure and importless, so node --test runs it.
 *
 * The Care Schedule (care_plan_entries) deletes and re-adds its rows on every save, so a call is
 * identified by WHAT it is, never by its row id: the day, the service, the part of the day, and
 * which one of those it is that day (in the schedule's own order). The database works this out
 * the same way (rota_generate_visits in migration 0491); these functions must stay in step with it.
 */

export type ScheduleEntry = {
  id: string;
  day_of_week: number; // 0 Monday
  service: string;
  unit: string;
  quantity: number | string | null;
  slot: string | null;
  position: number | null;
  carers: number | null;
};

export type CallSlot = {
  dayOfWeek: number;
  service: string;
  slotKey: string;
  occurrence: number;
  minutes: number | null; // null for a Fixed price call: needs a length set on the rota
  carers: number;
  entryId: string;
};

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Minutes for a Care Schedule unit and quantity ("30m" x 2 = 60); null for Fixed or unknown. */
export function callMinutes(unit: string, quantity: number | string | null): number | null {
  const q = quantity == null || quantity === "" ? 1 : Number(quantity);
  if (!Number.isFinite(q)) return null;
  const m = unit.match(/^(\d+)m$/);
  if (m) return Math.round(Number(m[1]) * q);
  const h = unit.match(/^(\d+)hr$/);
  if (h) return Math.round(Number(h[1]) * 60 * q);
  return null;
}

/** The current schedule's calls, each with its occurrence number, in day then schedule order. */
export function callSlots(entries: ScheduleEntry[]): CallSlot[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.day_of_week - b.day_of_week ||
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  );
  const seen = new Map<string, number>();
  return sorted.map((e) => {
    const slotKey = e.slot ?? "";
    const k = `${e.day_of_week}|${e.service}|${slotKey}`;
    const occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, occurrence);
    return {
      dayOfWeek: e.day_of_week,
      service: e.service,
      slotKey,
      occurrence,
      minutes: callMinutes(e.unit, e.quantity),
      carers: Math.max(1, Math.min(4, e.carers ?? 1)),
      entryId: e.id,
    };
  });
}

/** The key a visit made from this call on this date carries (never two visits for one key). */
export function generatedKey(serviceUserId: string, dateIso: string, c: Pick<CallSlot, "service" | "slotKey" | "occurrence">): string {
  return [serviceUserId, dateIso, c.service, c.slotKey, String(c.occurrence)].join(":");
}

/** "Lunch" from "lunch"; "" stays "". */
export function slotLabel(slotKey: string): string {
  return slotKey ? slotKey.charAt(0).toUpperCase() + slotKey.slice(1) : "";
}

/**
 * Be Care Compliant — turning the Setup Visit's calls into a weekly Care Plan.
 *
 * WHY (Phil, 2026-09-09): "if Care plan in place is yes, get them to add the number of calls a
 * day, durations, double or single handed. this is what will be billed in invoicing."
 *
 * The weekly Care Plan already holds exactly that — day, service, duration, handedness — and
 * Invoicing bills from it, so the Setup Visit does not keep a second copy of the same facts.
 * It asks at the visit and the answers become the plan. The office then edits the grid for the
 * days that differ, and nothing has to be typed twice or kept in step.
 *
 * FOUR SLOTS, because that is how a domiciliary rota is written: morning, lunch, tea, bed. A
 * blank duration means there is no call at that time — an absent call, not a zero-length one.
 *
 * EVERY DAY THE SAME. The Setup Visit asks what the package runs, not what each Tuesday looks
 * like; asking for a seven day grid at the door would not get filled in. Seven identical days
 * is the honest starting point and the grid is where a Sunday becomes different.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

/** The rota slots, in the order they happen. */
export const CALL_SLOTS = ["morning", "lunch", "tea", "bed"] as const;
export type CallSlot = (typeof CALL_SLOTS)[number];

/** Durations the Setup Visit offers. Every one is a real Care Plan unit (CARE_PLAN_UNITS),
 *  so a seeded row prices exactly like one typed into the grid. */
export const CALL_DURATIONS = ["15m", "30m", "45m", "1hr", "2hr"] as const;

/** The service a seeded call is billed as. The Setup Visit does not ask — it is a care call
 *  until somebody says otherwise, and Sit, Overnight and the rest are chosen in the grid. */
export const SEEDED_SERVICE = "Care";

export type SetupCall = { slot: CallSlot; unit: string; handed: "single" | "double" };

/** One row of the weekly plan, in the shape care_plan_entries stores. */
export type CarePlanRow = {
  day_of_week: number;
  service: string;
  unit: string;
  handed: "single" | "double";
  quantity: number;
  position: number;
};

/**
 * The calls a completed Setup Visit describes.
 *
 * A slot counts only when its duration is one the form offered. Handedness defaults to single
 * when the question was not answered — the field only appears once a duration is chosen, so a
 * missing answer means a call that was entered in a hurry, and a single carer is both the
 * commoner case and the one that cannot over-bill.
 */
export function callsFromSetupAnswers(
  answers: Record<string, unknown> | null | undefined,
): SetupCall[] {
  if (!answers) return [];
  const calls: SetupCall[] = [];
  for (const slot of CALL_SLOTS) {
    const unit = answers[`call_${slot}_duration`];
    if (typeof unit !== "string" || !(CALL_DURATIONS as readonly string[]).includes(unit)) continue;
    const handed = answers[`call_${slot}_handed`] === "double" ? "double" : "single";
    calls.push({ slot, unit, handed });
  }
  return calls;
}

/**
 * The weekly plan those calls make: every call, every day, in rota order.
 *
 * `position` runs across the whole week rather than restarting each day, so the grid draws the
 * calls in the order they happen rather than in whatever order the database returned them.
 */
export function carePlanRowsFromCalls(calls: ReadonlyArray<SetupCall>): CarePlanRow[] {
  const rows: CarePlanRow[] = [];
  let position = 0;
  for (let day = 0; day < 7; day++) {
    for (const call of calls) {
      rows.push({
        day_of_week: day,
        service: SEEDED_SERVICE,
        unit: call.unit,
        handed: call.handed,
        quantity: 1,
        position: position++,
      });
    }
  }
  return rows;
}

/** A sentence for the audit trail and the screen: what was actually put on the plan. */
export function describeCalls(calls: ReadonlyArray<SetupCall>): string {
  if (calls.length === 0) return "no calls";
  return calls
    .map((c) => `${c.slot} ${c.unit}${c.handed === "double" ? " double handed" : ""}`)
    .join(", ");
}

/**
 * Be Care Compliant — recording an absence meeting that was never booked here (DEF-072). Pure
 * and IMPORTLESS, so node --test can load it.
 *
 * Record meeting used to offer only the stages booked through Book meeting (Phil, 2026-07-12).
 * That left no way to record a meeting that had already been held: Thistle's Stage 1 meetings
 * with Asim and Jamie were held and written up on monday, and booking them now would have sent
 * both men formal letters and calendar invites for meetings that were over. Phil, 2026-09-24:
 * "Allow a meeting already held". When nothing is booked, any stage may be chosen, the date must
 * be today or earlier, and nothing is sent. A booked meeting works exactly as before.
 */

export const ALL_STAGES = [1, 2, 3, 4] as const;

/** The stages Record meeting offers: the booked ones, or all four when nothing is booked. */
export function recordableStages(bookedStages: number[]): number[] {
  const booked = [...new Set(bookedStages.filter((s) => s >= 1 && s <= 4))].sort((a, b) => a - b);
  return booked.length > 0 ? booked : [...ALL_STAGES];
}

/** "Stage 2" to 2; anything else to null. */
export function stageFrom(value: unknown): number | null {
  const m = /^Stage ([1-4])$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Why a meeting with no booking behind it cannot be recorded, or null when it can. It must say
 * which stage it was and when it was held, and it must already have happened: a meeting still to
 * come is booked, so the employee gets their letter.
 */
export function unbookedMeetingProblem(input: { stage: number | null; dateIso: string | null; todayIso: string }): string | null {
  if (!input.stage) return "Choose which stage this meeting was.";
  if (!input.dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateIso)) return "Enter the date the meeting was held.";
  if (input.dateIso > input.todayIso) {
    return "That date has not happened yet. Use Book meeting for a meeting still to come, so the employee gets their letter.";
  }
  return null;
}

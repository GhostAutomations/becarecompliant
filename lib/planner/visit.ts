/**
 * Be Care Compliant — a Planner booking is a VISIT, and a visit carries several tasks.
 *
 * WHY (Phil, 2026-09-18): "if they are at a house they may want to complete 2 or 3 tasks in
 * one visit." One task per booking was in the table, not just the form, so a supervision and
 * a spot check at the same address were two bookings at the same minute -- which the clash
 * rule refused outright, because nobody is visited twice at once. The way to do two jobs at
 * one house was to lie about the time.
 *
 * The three rules that both the screen and the server have to agree on live here, pure and
 * importless so they can be tested: what the targets posted by the form mean, what the visit
 * is called, and when it is finished.
 */

export type BookingTarget = { instanceId: string | null; trackerKey: string | null };

/** The task list as the form posts it: a check instance id, or "tracker:<key>". Blank
 *  entries and repeats are dropped, so a double-click cannot book the same job twice. */
export function parseBookingTargets(values: ReadonlyArray<string>): BookingTarget[] {
  const out: BookingTarget[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    if (v.startsWith("tracker:")) {
      const key = v.slice("tracker:".length).trim();
      if (key) out.push({ instanceId: null, trackerKey: key });
    } else {
      out.push({ instanceId: v, trackerKey: null });
    }
  }
  return out;
}

/** What the chip says. One job names itself; several are counted, because three check names
 *  stacked in a calendar cell is not a label, it is a wall. */
export function visitLabel(title: string | null | undefined, taskLabels: ReadonlyArray<string>): string {
  const t = (title ?? "").trim();
  if (t) return t;
  const labels = taskLabels.map((l) => (l ?? "").trim()).filter(Boolean);
  if (labels.length > 1) return `${labels.length} tasks`;
  return labels[0] || "Task";
}

/**
 * When the visit itself is finished: when every job on it is, and not before.
 *
 * Phil chose this over "the first one closes it" for the obvious reason -- a visit that reads
 * as done with two of its three jobs never carried out is worse than no status at all. A
 * cancelled task does not hold the visit open; it was called off, not left undone.
 */
export function visitIsComplete(
  taskStatuses: ReadonlyArray<"planned" | "completed" | "cancelled">,
): boolean {
  if (taskStatuses.length === 0) return false;
  if (taskStatuses.some((s) => s === "planned")) return false;
  return taskStatuses.some((s) => s === "completed");
}

/** "2 of 3" for a visit part way through, or null when there is nothing worth saying. */
export function visitProgress(
  taskStatuses: ReadonlyArray<"planned" | "completed" | "cancelled">,
): string | null {
  if (taskStatuses.length < 2) return null;
  const done = taskStatuses.filter((s) => s === "completed").length;
  return `${done} of ${taskStatuses.length}`;
}

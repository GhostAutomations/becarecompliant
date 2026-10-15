/**
 * Be Care Compliant: the Dashboard's saved copy, tile by tile (Phil, 2026-10-15; 0482;
 * docs/decisions/dashboard-copy.md).
 *
 * Every tile comes from the person's saved copy. The whole copy is rebuilt every ten minutes on
 * the clock (:00, :10, :20 ...). In between, something done is a push: the database notes which
 * table changed for which company (dashboard_changes), and only the tiles that read that table are
 * worked out again, before the page is drawn, so something done is never shown as outstanding.
 *
 * Importless so it runs under node --test.
 */

export const LIVE_TILES = [
  "due",
  "planner",
  "complaints",
  "incidents",
  "absence",
  "holidays",
  "spend",
  "activity",
  "onCall",
] as const;
export type LiveTile = (typeof LIVE_TILES)[number];

/** The tables each tile reads (directly or through its views). A change to any of them makes the
 *  tile out of date. Keep in step with 0482's trigger list. */
export const TILE_TABLES: Record<LiveTile, readonly string[]> = {
  due: [
    "people",
    "check_instances",
    "check_definitions",
    "person_trackers",
    "service_users",
    "service_user_trackers",
    "person_training",
    "training_courses",
    "company_policies",
  ],
  planner: ["planner_bookings", "planner_booking_tasks"],
  complaints: ["complaints"],
  incidents: ["incidents"],
  absence: ["absence_events", "absence_meetings", "rtw_questionnaires", "absence_config", "people"],
  holidays: ["holiday_requests"],
  spend: ["usage_events", "ai_credit_ledger", "company_ai_credits", "company_sms_credits"],
  activity: ["user_notifications"],
  onCall: ["on_call_logs"],
};

export const SLOT_MS = 10 * 60 * 1000;

/** Set by the Dashboard's "bring the copy up to date" action: a rebuild asked for at this time. */
export const DASH_REBUILD_COOKIE = "bcc_dash_rebuild";

/**
 * A change counts against a tile worked out up to this long after it. A save's time is taken
 * when it starts, and it is only seen once it finishes, so a tile worked out in between would
 * otherwise miss it. Within the margin the tile is simply worked out again on the next look.
 */
export const CHANGE_MARGIN_MS = 60 * 1000;

/** The start of the ten minute slot a moment falls in. London is a whole number of hours from
 *  UTC, so :00, :10, :20 ... are the same marks on both clocks. */
export function slotStart(ms: number): number {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}

/** True when the copy was built before the latest ten minute mark. */
export function copyIsOld(builtAtIso: string, nowMs: number): boolean {
  const built = Date.parse(builtAtIso);
  if (!Number.isFinite(built)) return true;
  return slotStart(built) < slotStart(nowMs);
}

/** Milliseconds from now to the next ten minute mark. */
export function msToNextSlot(nowMs: number): number {
  return slotStart(nowMs) + SLOT_MS - nowMs;
}

export type TableChange = { table_name: string; changed_at: string };

/** The tiles that read a table changed since (or within the margin before) they were worked out.
 *  A tile with no time, or missing, is out of date. */
export function outOfDateTiles(
  tileAt: Partial<Record<LiveTile, string>>,
  changes: TableChange[],
  marginMs: number = CHANGE_MARGIN_MS,
): LiveTile[] {
  const last = new Map<string, number>();
  for (const c of changes) {
    const t = Date.parse(c.changed_at);
    if (!Number.isFinite(t)) continue;
    if (t > (last.get(c.table_name) ?? -Infinity)) last.set(c.table_name, t);
  }
  const out: LiveTile[] = [];
  for (const tile of LIVE_TILES) {
    const at = tileAt[tile] ? Date.parse(tileAt[tile] as string) : NaN;
    if (!Number.isFinite(at)) {
      out.push(tile);
      continue;
    }
    if (TILE_TABLES[tile].some((table) => (last.get(table) ?? -Infinity) > at - marginMs)) out.push(tile);
  }
  return out;
}

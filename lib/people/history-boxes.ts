/**
 * Be Care Compliant — the boxes behind "they already work here". Pure and IMPORTLESS, so
 * node --test can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-21): "in people we have add a person, this assumes that it is
 * always a new person, i want an option on the add a person page, tick it and all the column
 * names are visible with boxes for the required data to be added, along with the current boxes
 * that are on add a person, then when the add person button is pressed, it adds them to the
 * matrix with all the data just entered."
 *
 * Somebody joining a company that already runs has a history. Until now Add a person could only
 * make a new starter, and a carer with three supervisions behind them had to be added and then
 * back-filled by hand — which is literally what happened to Thistle's 86 spot checks (DEF-024).
 *
 * WHAT IT DECIDES: which boxes to show, in the order the matrix shows its columns, under the
 * names the company has given those columns. THE SCREEN AND THE SAVE READ THE SAME LIST, which
 * is the point of putting it here: a box that appears and is then ignored is the same defect as
 * a ticked department that does nothing.
 *
 * DATES THEY WERE DONE, not dates they are due. Phil, asked and answered 2026-09-21. A due date
 * follows from a completion and the company's own cycle, so asking for both invites two answers
 * to one question — and the one typed in the second box would be overwritten the next time the
 * check was completed anyway.
 */

/** A check definition, at the level this file needs it. */
export type DefLite = {
  id: string;
  key: string;
  name: string;
  recurring: boolean;
};

/** One box on the panel. */
export type HistoryBox = {
  /** The form field name. */
  name: string;
  /** What it is called on the matrix. */
  label: string;
  definitionId: string;
  /** Which supervision this is, where the check runs in slots. Null everywhere else. */
  slot: number | null;
};

/** One check's history, as the seeding call wants it: newest first, slots aligned. */
export type HistoryEntry = {
  definitionId: string;
  name: string;
  dates: string[];
  slots: Array<number | null>;
};

export const HISTORY_FLAG = "already_here";

/** The tracker boxes, which are columns on the matrix too. */
export const TRACKER_BOXES: ReadonlyArray<{
  name: string;
  column: string;
  fallback: string;
  kind: "date" | "rtw_limits" | "probation_status";
}> = [
  { name: "t_dbs_date", column: "dbs", fallback: "DBS", kind: "date" },
  { name: "t_enhanced_dbs_date", column: "enhanced_dbs", fallback: "Enhanced DBS", kind: "date" },
  { name: "t_rtw_expiry_date", column: "rtw_expiry", fallback: "RTW Expiry", kind: "date" },
  { name: "t_rtw_limits", column: "rtw_limits", fallback: "RTW Limits", kind: "rtw_limits" },
  { name: "t_probation_end_due", column: "probation_end_due", fallback: "Probation End Due", kind: "date" },
  { name: "t_probation_end_actual", column: "probation_end_actual", fallback: "Probation End Actual", kind: "date" },
  { name: "t_probation_status", column: "probation_status", fallback: "Probation Status", kind: "probation_status" },
  { name: "t_probation_extension_date", column: "probation_extension", fallback: "Probation Extension", kind: "date" },
];

/** The database column each tracker box writes to. */
export const TRACKER_COLUMN: Readonly<Record<string, string>> = {
  t_dbs_date: "dbs_date",
  t_enhanced_dbs_date: "enhanced_dbs_date",
  t_rtw_expiry_date: "rtw_expiry_date",
  t_rtw_limits: "rtw_limits",
  t_probation_end_due: "probation_end_due",
  t_probation_end_actual: "probation_end_actual",
  t_probation_status: "probation_status",
  t_probation_extension_date: "probation_extension_date",
};

function label(columnLabels: Readonly<Record<string, string>>, key: string, fallback: string): string {
  return columnLabels[key] || fallback;
}

/**
 * Every "when was this last done" box, in matrix order.
 *
 * SUPERVISION IS ASKED SLOT BY SLOT, because that is how the matrix draws it and how the cycle
 * works: Supervision 1, 2 and 3 are three deadlines in a year, not three names for the same
 * thing. Each one is stored with the slot it occupied, which is what lets the register draw a
 * carer's history where it actually happened (0273, and lib/people/logic supervisionSlots).
 *
 * A COMPANY RUNNING FOUR SUPERVISIONS instead of three and an appraisal gets a fourth box and no
 * appraisal, matching its own matrix. One setting, read once, obeyed by both.
 *
 * ONE-OFF CHECKS ARE LEFT OUT. Mentoring, a health check, Lead the Leader: they have no cycle to
 * restart and no column on the matrix, so a box for them would be asking for something the
 * register would never show back.
 */
export function historyBoxes(
  defs: readonly DefLite[],
  columnLabels: Readonly<Record<string, string>> = {},
  cycleMode: "appraisal" | "four_supervisions" = "appraisal",
): HistoryBox[] {
  const out: HistoryBox[] = [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const supCount = cycleMode === "four_supervisions" ? 4 : 3;

  const training = ["manual_handling", "competency"];
  for (const key of training) {
    const def = byKey.get(key);
    if (def?.recurring) {
      out.push({
        name: `done_${def.id}`,
        label: label(columnLabels, key === "competency" ? "medication_competency" : key, def.name),
        definitionId: def.id,
        slot: null,
      });
    }
  }

  const spot = byKey.get("spot_check");
  if (spot?.recurring) {
    out.push({
      name: `done_${spot.id}`,
      label: label(columnLabels, "recent_spot_check", "Recent Spot Check"),
      definitionId: spot.id,
      slot: null,
    });
  }

  const sup = byKey.get("supervision");
  if (sup?.recurring) {
    for (let n = 1; n <= supCount; n++) {
      out.push({
        name: `done_${sup.id}_${n}`,
        label: label(columnLabels, `sup${n}_comp`, `Supervision ${n} Done`),
        definitionId: sup.id,
        slot: n,
      });
    }
  }

  if (cycleMode === "appraisal") {
    const appraisal = byKey.get("appraisal");
    if (appraisal?.recurring) {
      out.push({
        name: `done_${appraisal.id}`,
        label: label(columnLabels, "aa_comp", "Annual Appraisal Done"),
        definitionId: appraisal.id,
        slot: null,
      });
    }
  }

  const audit = byKey.get("audit");
  if (audit?.recurring) {
    out.push({
      name: `done_${audit.id}`,
      label: label(columnLabels, "audit", "Audit"),
      definitionId: audit.id,
      slot: null,
    });
  }

  /* Anything else the company has made recurring and put on its register. Named by the check
     itself, because a column the product does not know about has no matrix name to borrow. */
  const named = new Set(["manual_handling", "competency", "spot_check", "supervision", "appraisal", "audit"]);
  for (const def of defs) {
    if (!def.recurring || named.has(def.key)) continue;
    out.push({ name: `done_${def.id}`, label: def.name, definitionId: def.id, slot: null });
  }

  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn what was typed into one entry per check, newest completion first.
 *
 * A BLANK BOX IS AN ANSWER: it means never done, so nothing is recorded and that check schedules
 * itself exactly as it does for a new starter (Phil, asked and answered 2026-09-21). Anything
 * that is not a date is dropped rather than guessed at.
 */
export function historyEntries(
  boxes: readonly HistoryBox[],
  values: Readonly<Record<string, string>>,
  defs: readonly DefLite[],
): HistoryEntry[] {
  const nameById = new Map(defs.map((d) => [d.id, d.name]));
  const byDef = new Map<string, Array<{ date: string; slot: number | null }>>();
  for (const box of boxes) {
    const raw = (values[box.name] ?? "").trim();
    if (!ISO.test(raw)) continue;
    byDef.set(box.definitionId, [...(byDef.get(box.definitionId) ?? []), { date: raw, slot: box.slot }]);
  }
  const out: HistoryEntry[] = [];
  for (const [definitionId, rows] of byDef) {
    // Newest first: the seeding call treats the first as the one that moves the check on.
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    out.push({
      definitionId,
      name: nameById.get(definitionId) ?? "check",
      dates: sorted.map((r) => r.date),
      slots: sorted.map((r) => r.slot),
    });
  }
  return out;
}

/** The tracker patch, taking only the boxes that were filled in. */
export function trackerPatch(values: Readonly<Record<string, string>>): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const box of TRACKER_BOXES) {
    const raw = (values[box.name] ?? "").trim();
    if (!raw) continue;
    if (box.kind === "date" && !ISO.test(raw)) continue;
    patch[TRACKER_COLUMN[box.name]] = raw;
  }
  return patch;
}

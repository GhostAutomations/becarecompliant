/**
 * Be Care Compliant — what sits behind the Overdue and Due in 7, 14 and 30 day tiles.
 *
 * Phil, 2026-09-27: hovering (or tapping, on a phone) one of those tiles shows what is due,
 * so a manager does not have to click through to find out. The first 8, soonest first, then
 * "and X more".
 *
 * ONE function makes both the NUMBER on the tile and the LIST behind it, so the two can never
 * disagree. The rules are the ones the tiles have always used:
 *
 *  - Overdue counts RECORDS (a person or service user with any red check), not checks. The rag
 *    comes from the status view, never from a date compare, because a finished one off check
 *    keeps its old due date (the 2026-07-17 gotcha). One line per record, listing its red checks.
 *  - Due in 7, 14 and 30 days count CHECKS in SEPARATE bands (Phil, 2026-09-28: "7 needs to
 *    show 0-7, 14 needs to show 8-14 and 30 needs to show 15-30"; nested windows made each tile
 *    repeat the one before it): today to day 7, days 8 to 14, days 15 to 30. One line per check.
 *
 * Leavers, archived and discharged records never arrive here: the status views exclude them.
 * Pure and importless so it runs under node --test.
 *
 * TRAINING IS THE THIRD SECTION (Phil, popup 2026-10-05). kind "training" is one person on one
 * course, scored by the Training register's own rule (cellFor): Not done and Expired are red and
 * so Overdue; a renewal date in a band is due. Overdue counts the people with any overdue
 * training, separately from their People checks, so the tile reads "3 people, 1 Service User,
 * 5 for training" and the three figures add up to the number on it.
 */

export type DueRow = {
  kind: "person" | "service_user" | "training";
  recordId: string;
  name: string;
  checkName: string | null;
  dueDate: string | null; // yyyy-mm-dd
  rag: string | null;
  /** The record's branch, for the Overdue and Due reports (2026-10-05). The tiles ignore it. */
  branchId?: string | null;
};

export type PreviewLine = {
  key: string;
  href: string;
  name: string;
  /** The check, or for an overdue record every overdue check, comma separated. */
  detail: string;
  /** "12 days late", "Today", "Tomorrow", "Due 03/10/2026". */
  when: string;
  tone: "red" | "amber";
};

export type PreviewBox = { total: number; lines: PreviewLine[] };

export type DuePreview = {
  overdue: PreviewBox & { people: number; serviceUsers: number; training: number };
  d7: PreviewBox;
  d14: PreviewBox;
  d30: PreviewBox;
};

export const PREVIEW_LIMIT = 8;

const DAY = 86_400_000;

function toMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(toMs(iso) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetweenIso(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY);
}

export function slashDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function recordHref(kind: DueRow["kind"], id: string): string {
  if (kind === "training") return `/people/training?person=${id}`;
  return kind === "person" ? `/people/${id}` : `/service-users/${id}`;
}

export function lateLabel(dueIso: string, todayIso: string): string {
  const n = daysBetweenIso(dueIso, todayIso);
  if (n <= 0) return "Due today";
  return n === 1 ? "1 day late" : `${n} days late`;
}

export function dueLabel(dueIso: string, todayIso: string): string {
  const n = daysBetweenIso(todayIso, dueIso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `Due ${slashDate(dueIso)}`;
}

export function buildDuePreview(rows: DueRow[], todayIso: string, limit = PREVIEW_LIMIT): DuePreview {
  // Overdue: one entry per record with any red check.
  type Late = { kind: DueRow["kind"]; id: string; name: string; checks: string[]; oldest: string | null };
  const late = new Map<string, Late>();
  for (const r of rows) {
    if (r.rag !== "red") continue;
    const k = `${r.kind}:${r.recordId}`;
    let e = late.get(k);
    if (!e) {
      e = { kind: r.kind, id: r.recordId, name: r.name, checks: [], oldest: null };
      late.set(k, e);
    }
    if (r.checkName && !e.checks.includes(r.checkName)) e.checks.push(r.checkName);
    if (r.dueDate && (!e.oldest || r.dueDate < e.oldest)) e.oldest = r.dueDate;
  }
  const lateList = [...late.values()].sort(
    (a, b) => (a.oldest ?? "9999").localeCompare(b.oldest ?? "9999") || a.name.localeCompare(b.name),
  );
  const overdue = {
    total: lateList.length,
    people: lateList.filter((e) => e.kind === "person").length,
    serviceUsers: lateList.filter((e) => e.kind === "service_user").length,
    training: lateList.filter((e) => e.kind === "training").length,
    lines: lateList.slice(0, limit).map<PreviewLine>((e) => ({
      key: `${e.kind}:${e.id}`,
      href: recordHref(e.kind, e.id),
      name: e.name,
      // Training says so, because "Fire Safety" under a name could be read as one of their checks.
      detail: e.kind === "training" ? `Training: ${e.checks.join(", ")}` : e.checks.join(", "),
      when: e.oldest ? lateLabel(e.oldest, todayIso) : e.kind === "training" ? "Not done" : "Overdue",
      tone: "red",
    })),
  };

  // Due bands: one entry per check, each check in exactly one band (dueBandRows below).
  const box = (band: Exclude<DueBand, "overdue">): PreviewBox => {
    const within = dueBandRows(rows, todayIso, band);
    return {
      total: within.length,
      lines: within.slice(0, limit).map((r) => ({
        key: `${r.kind}:${r.recordId}:${r.checkName}:${r.dueDate}`,
        href: recordHref(r.kind, r.recordId),
        name: r.name,
        detail: r.kind === "training" ? `Training: ${r.checkName}` : (r.checkName as string),
        when: dueLabel(r.dueDate as string, todayIso),
        tone: "amber",
      })),
    };
  };

  return { overdue, d7: box("d7"), d14: box("d14"), d30: box("d30") };
}

/** The four bands the dashboard tiles and the matching reports share (Phil, 2026-10-05). */
export type DueBand = "overdue" | "d7" | "d14" | "d30";

/**
 * Every CHECK in one band, soonest first. The SAME rules as the tiles, because the tiles now use
 * this too:
 *  - overdue: every red check (the rag comes from the status view, never a date compare);
 *  - d7: due today to day 7; d14: days 8 to 14; d30: days 15 to 30. Never red, so a check is in
 *    exactly one band and nothing overdue is counted twice.
 * The Overdue TILE counts records with any red check; the Overdue REPORT lists their checks, and
 * says how many records that is, so the two can be read against each other.
 */
export function dueBandRows(rows: DueRow[], todayIso: string, band: DueBand): DueRow[] {
  const byDate = (a: DueRow, b: DueRow) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    a.name.localeCompare(b.name) ||
    (a.checkName ?? "").localeCompare(b.checkName ?? "");
  if (band === "overdue") return rows.filter((r) => r.rag === "red").sort(byDate);
  const in7 = addDaysIso(todayIso, 7);
  const in14 = addDaysIso(todayIso, 14);
  const in30 = addDaysIso(todayIso, 30);
  const [after, until] =
    band === "d7" ? [null, in7] : band === "d14" ? [in7, in14] : [in14, in30];
  return rows
    // A red row is already overdue. Only a DBS or Right to Work never recorded can be red and
    // dated today (it counts from the start date, audit W1), and it must not appear twice.
    .filter(
      (r) =>
        r.rag !== "red" &&
        r.checkName &&
        r.dueDate &&
        r.dueDate >= todayIso &&
        (after === null || r.dueDate > after) &&
        r.dueDate <= until,
    )
    .sort(byDate);
}

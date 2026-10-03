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
 */

export type DueRow = {
  kind: "person" | "service_user";
  recordId: string;
  name: string;
  checkName: string | null;
  dueDate: string | null; // yyyy-mm-dd
  rag: string | null;
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
  overdue: PreviewBox & { people: number; serviceUsers: number };
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
    lines: lateList.slice(0, limit).map<PreviewLine>((e) => ({
      key: `${e.kind}:${e.id}`,
      href: recordHref(e.kind, e.id),
      name: e.name,
      detail: e.checks.join(", "),
      when: e.oldest ? lateLabel(e.oldest, todayIso) : "Overdue",
      tone: "red",
    })),
  };

  // Due bands: one entry per check, each check in exactly one band.
  const in7 = addDaysIso(todayIso, 7);
  const in14 = addDaysIso(todayIso, 14);
  const in30 = addDaysIso(todayIso, 30);
  const upcoming = rows
    // A red row is already overdue. Only a DBS or Right to Work never recorded can be red and
    // dated today (it counts from the start date, audit W1), and it must not appear twice.
    .filter((r) => r.rag !== "red" && r.checkName && r.dueDate && r.dueDate >= todayIso && r.dueDate <= in30)
    .sort(
      (a, b) =>
        (a.dueDate as string).localeCompare(b.dueDate as string) ||
        a.name.localeCompare(b.name) ||
        (a.checkName as string).localeCompare(b.checkName as string),
    );
  const box = (after: string | null, until: string): PreviewBox => {
    const within = upcoming.filter(
      (r) => (after === null || (r.dueDate as string) > after) && (r.dueDate as string) <= until,
    );
    return {
      total: within.length,
      lines: within.slice(0, limit).map((r) => ({
        key: `${r.kind}:${r.recordId}:${r.checkName}:${r.dueDate}`,
        href: recordHref(r.kind, r.recordId),
        name: r.name,
        detail: r.checkName as string,
        when: dueLabel(r.dueDate as string, todayIso),
        tone: "amber",
      })),
    };
  };

  return { overdue, d7: box(null, in7), d14: box(in7, in14), d30: box(in14, in30) };
}

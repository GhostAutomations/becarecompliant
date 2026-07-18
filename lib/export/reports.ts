import "server-only";

/**
 * Be Care Compliant — register and branch/company compliance reports (Phase 8).
 *
 * Reads the existing server computed RAG rollup views through the shared data
 * layer (listRegister), never recomputing RAG. Excludes leavers, archived people
 * and cancelled/discharged service users exactly as the active registers do
 * (listRegister scope "active"). Produces a ReportDoc for the shared PDF builder
 * plus a CSV, so PDF and CSV always carry the same figures. No dashes in copy.
 *
 * Inspector framing: the compliance summary answers "are we inspection ready" at
 * a glance (CQC single assessment framework, CIW quality of care review), and the
 * overdue and due soon lists drill straight to the exact records that need action.
 */

import { type Rag, todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { listRegister as listPeopleRegister } from "@/lib/people/data";
import { supervisionSlots, appraisalSlot } from "@/lib/people/logic";
import {
  WORKING_STATUS_LABELS,
  PROBATION_STATUS_LABELS,
  type CheckStatus,
  type RegisterRow,
} from "@/lib/people/types";
import { listRegister as listServiceUserRegister } from "@/lib/service-users/data";
import { reviewSlots } from "@/lib/service-users/logic";
import { SERVICE_STATUS_LABELS, type SuCheckStatus, type ServiceUserRow } from "@/lib/service-users/types";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportBlock, ReportDoc } from "@/lib/export/pdf";
import { fmtDate, generatedAt, ragLabel, ragTone } from "@/lib/export/format";

const EXCLUSION_NOTE =
  "Active records only. Leavers, archived people and cancelled or discharged service users are excluded, matching the registers.";

type Overdue = { record: string; check: string; due: string | null };

/** The date window a report covers: checks are shown by their due date. `from`
 *  null means "include everything overdue" (no lower bound); `to` is the upper
 *  bound (default today + 30 days). */
export type ReportWindow = { from: string | null; to: string };

function todayIso(): string {
  return formatCivilDate(todayInLondon());
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Default report window: overdue plus the next 30 days (Phil, 2026-07-14). */
export function defaultReportWindow(): ReportWindow {
  return { from: null, to: addDaysIso(todayIso(), 30) };
}
/** Resolve raw from/to query values into a valid window (falling back to default). */
export function resolveReportWindow(from: string | null, to: string | null): ReportWindow {
  return {
    from: from && ISO_RE.test(from) ? from : null,
    to: to && ISO_RE.test(to) ? to : addDaysIso(todayIso(), 30),
  };
}

/** A readable label for the window, for the report meta. */
function periodLabel(win: ReportWindow): string {
  return win.from
    ? `${fmtDate(win.from)} to ${fmtDate(win.to)}`
    : `Overdue, and due up to ${fmtDate(win.to)}`;
}

/**
 * Split a record's checks into overdue (due before today) and due in the period
 * (due today up to the window's end), scoped to the window by DUE DATE. Checks
 * due after the window, or before the window's `from`, are not shown.
 */
function splitChecks(
  recordName: string,
  checks: (CheckStatus | SuCheckStatus)[],
  win: ReportWindow,
  today: string,
): { overdue: Overdue[]; dueSoon: Overdue[] } {
  const overdue: Overdue[] = [];
  const dueSoon: Overdue[] = [];
  for (const c of checks) {
    const due = c.due_date;
    if (!due) continue;
    if (win.from && due < win.from) continue;
    if (due > win.to) continue;
    if (due < today) overdue.push({ record: recordName, check: c.check_name, due });
    else dueSoon.push({ record: recordName, check: c.check_name, due });
  }
  return { overdue, dueSoon };
}

function ragCell(rag: Rag | "none") {
  if (rag === "none") return { text: "No checks", rag: "neutral" as const };
  return { text: ragLabel(rag), rag: ragTone(rag) };
}

/** A completed date cell coloured on time (green) or late (red), matching the
 *  register pill. Blank when never completed. */
function completedCell(date: string | null, rag: Rag | "none") {
  if (!date) return { text: "—", rag: "neutral" as const };
  const late = rag === "red";
  return { text: `${fmtDate(date)}${late ? " (late)" : ""}`, rag: (late ? "red" : "green") as const };
}

function summaryCounts(rags: (Rag | "none")[]) {
  return {
    total: rags.length,
    red: rags.filter((r) => r === "red").length,
    amber: rags.filter((r) => r === "amber").length,
    green: rags.filter((r) => r === "green").length,
    none: rags.filter((r) => r === "none").length,
  };
}

// ---------------------------------------------------------------------------
// People register report
// ---------------------------------------------------------------------------

export type RegisterReportInput = {
  companyId: string;
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  /** Date window the report covers (by check due date). Defaults to overdue + 30 days. */
  window?: ReportWindow;
};

export async function buildPeopleRegisterReport(
  input: RegisterReportInput,
): Promise<{ doc: ReportDoc; csv: string; base: string; recordCount: number }> {
  const { definitions, rows } = await listPeopleRegister(input.companyId, input.branchId, "active");
  const scopeLabel = input.branchName ? input.branchName : "All branches";
  const win = input.window ?? defaultReportWindow();
  const today = todayIso();

  const supDef = definitions.find((d) => d.key === "supervision");
  const supInterval = supDef?.interval ?? 90;
  const supAmber = supDef?.amber_days ?? 30;
  // Latest supervision + appraisal per person, coloured on time / late (register pill).
  const cycleRows = rows
    .map((r: RegisterRow) => {
      const appraisalCompletedOn = r.statusByKey["appraisal"]?.last_completed_on ?? null;
      const sup = supervisionSlots(
        supInterval,
        r.supCompDates,
        supAmber,
        appraisalCompletedOn,
        r.tracker?.probation_end_actual ?? null,
      );
      const lastSup = [...sup].reverse().find((s) => s.comp) ?? null;
      const aa = appraisalSlot(appraisalCompletedOn, r.supCompDates, supInterval, supAmber);
      return { name: r.person.full_name, lastSup, aa };
    })
    .filter((x) => (x.lastSup && x.lastSup.comp) || x.aa.comp);

  const counts = summaryCounts(rows.map((r) => r.rollup?.rag ?? "none"));
  const allOverdue: Overdue[] = [];
  const allDueSoon: Overdue[] = [];

  const recordRows = rows.map((r: RegisterRow) => {
    const checks = Object.values(r.statuses);
    const { overdue, dueSoon } = splitChecks(r.person.full_name, checks, win, today);
    allOverdue.push(...overdue);
    allDueSoon.push(...dueSoon);
    return [
      { text: r.person.full_name, strong: true },
      { text: r.person.branch_name ?? input.branchName ?? "" },
      { text: WORKING_STATUS_LABELS[r.person.employment_status] },
      ragCell(r.rollup?.rag ?? "none"),
      { text: String(overdue.length) },
      { text: String(dueSoon.length) },
    ];
  });

  // Probation block (all four fields, per Phil's decision).
  const probationRows = rows
    .filter((r) => r.tracker && (r.tracker.probation_status || r.tracker.probation_end_due))
    .map((r) => {
      const t = r.tracker!;
      return [
        { text: r.person.full_name, strong: true },
        { text: t.probation_status ? PROBATION_STATUS_LABELS[t.probation_status] : "Not set" },
        { text: fmtDate(t.probation_end_due) },
        { text: fmtDate(t.probation_extension_date) },
        { text: fmtDate(t.probation_end_actual) },
      ];
    });

  const doc: ReportDoc = {
    title: "People compliance register",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `PREG-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Period", value: periodLabel(win) },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote: EXCLUSION_NOTE,
    blocks: [
      { kind: "heading", text: "Compliance summary" },
      {
        kind: "table",
        columns: [
          { header: "Compliant" },
          { header: "Due soon" },
          { header: "Overdue" },
          { header: "No checks" },
          { header: "Total people" },
        ],
        rows: [[
          { text: String(counts.green), rag: "green" },
          { text: String(counts.amber), rag: "amber" },
          { text: String(counts.red), rag: "red" },
          { text: String(counts.none), rag: "neutral" },
          { text: String(counts.total), strong: true },
        ]],
      },
      { kind: "heading", text: "People" },
      {
        kind: "table",
        emptyText: "No active people in this scope.",
        columns: [
          { header: "Name", width: "30%" },
          { header: "Branch", width: "22%" },
          { header: "Working status", width: "16%" },
          { header: "Compliance", width: "14%" },
          { header: "Overdue", width: "9%", align: "right" },
          { header: "Due", width: "9%", align: "right" },
        ],
        rows: recordRows,
      },
      ...overdueBlocks(allOverdue, allDueSoon, win),
      ...(cycleRows.length > 0
        ? ([
            { kind: "heading", text: "Supervision and appraisal" },
            {
              kind: "table",
              columns: [
                { header: "Name", width: "40%" },
                { header: "Latest supervision", width: "30%" },
                { header: "Latest appraisal", width: "30%" },
              ],
              rows: cycleRows.map((x) => [
                { text: x.name, strong: true },
                completedCell(x.lastSup?.comp ?? null, x.lastSup?.rag ?? "none"),
                completedCell(x.aa.comp, x.aa.compRag),
              ]),
            },
          ] as ReportBlock[])
        : []),
      ...(probationRows.length > 0
        ? ([
            { kind: "heading", text: "Probation" },
            {
              kind: "table",
              columns: [
                { header: "Name", width: "28%" },
                { header: "Status", width: "16%" },
                { header: "Original end due", width: "19%" },
                { header: "Extension date", width: "18%" },
                { header: "Actual end", width: "19%" },
              ],
              rows: probationRows,
            },
          ] as ReportBlock[])
        : []),
    ],
  };

  const csvRows: CsvCell[][] = rows.map((r) => {
    const checks = Object.values(r.statuses);
    const { overdue, dueSoon } = splitChecks(r.person.full_name, checks, win, today);
    const t = r.tracker;
    return [
      r.person.full_name,
      r.person.branch_name ?? input.branchName ?? "",
      WORKING_STATUS_LABELS[r.person.employment_status],
      r.rollup ? (r.rollup.rag === "none" ? "No checks" : ragLabel(r.rollup.rag)) : "No checks",
      overdue.length,
      dueSoon.length,
      t?.probation_status ? PROBATION_STATUS_LABELS[t.probation_status] : "",
      fmtDate(t?.probation_end_due),
      fmtDate(t?.probation_extension_date),
      fmtDate(t?.probation_end_actual),
    ];
  });
  const csv = buildCsv(
    ["Name", "Branch", "Working status", "Compliance", "Overdue checks", "Due checks in period", "Probation status", "Probation original end due", "Probation extension date", "Probation actual end"],
    csvRows,
  );

  return { doc, csv, base: `people-register-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}`, recordCount: rows.length };
}

// ---------------------------------------------------------------------------
// Service User register report
// ---------------------------------------------------------------------------

export async function buildServiceUserRegisterReport(
  input: RegisterReportInput,
): Promise<{ doc: ReportDoc; csv: string; base: string; recordCount: number }> {
  const { definitions, rows } = await listServiceUserRegister(input.companyId, input.branchId, "active");
  const scopeLabel = input.branchName ? input.branchName : "All branches";
  const win = input.window ?? defaultReportWindow();
  const today = todayIso();

  const reviewDef = definitions.find((d) => d.key === "care_plan_review");
  const reviewInterval = reviewDef?.interval ?? 80;
  const reviewAmber = reviewDef?.amber_days ?? 30;
  // Latest care plan review per service user, coloured on time / late (register pill).
  const reviewRows = rows
    .map((r: ServiceUserRow) => {
      const slots = reviewSlots(r.service_user.package_start_date, r.reviewComps, reviewInterval, 4, reviewAmber);
      const lastRev = [...slots].reverse().find((s) => s.comp) ?? null;
      return { name: r.service_user.full_name, lastRev };
    })
    .filter((x) => x.lastRev && x.lastRev.comp);

  const counts = summaryCounts(rows.map((r) => r.rollup?.rag ?? "none"));
  const allOverdue: Overdue[] = [];
  const allDueSoon: Overdue[] = [];

  const recordRows = rows.map((r: ServiceUserRow) => {
    const checks = Object.values(r.statusByKey);
    const { overdue, dueSoon } = splitChecks(r.service_user.full_name, checks, win, today);
    allOverdue.push(...overdue);
    allDueSoon.push(...dueSoon);
    return [
      { text: r.service_user.full_name, strong: true },
      { text: r.service_user.branch_name ?? input.branchName ?? "" },
      { text: SERVICE_STATUS_LABELS[r.service_user.service_status] },
      ragCell(r.rollup?.rag ?? "none"),
      { text: String(overdue.length) },
      { text: String(dueSoon.length) },
    ];
  });

  const doc: ReportDoc = {
    title: "Service User compliance register",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `SUREG-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Period", value: periodLabel(win) },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote: EXCLUSION_NOTE,
    blocks: [
      { kind: "heading", text: "Compliance summary" },
      {
        kind: "table",
        columns: [
          { header: "Compliant" },
          { header: "Due soon" },
          { header: "Overdue" },
          { header: "No checks" },
          { header: "Total service users" },
        ],
        rows: [[
          { text: String(counts.green), rag: "green" },
          { text: String(counts.amber), rag: "amber" },
          { text: String(counts.red), rag: "red" },
          { text: String(counts.none), rag: "neutral" },
          { text: String(counts.total), strong: true },
        ]],
      },
      { kind: "heading", text: "Service Users" },
      {
        kind: "table",
        emptyText: "No active service users in this scope.",
        columns: [
          { header: "Name", width: "30%" },
          { header: "Branch", width: "22%" },
          { header: "Status", width: "16%" },
          { header: "Compliance", width: "14%" },
          { header: "Overdue", width: "9%", align: "right" },
          { header: "Due", width: "9%", align: "right" },
        ],
        rows: recordRows,
      },
      ...overdueBlocks(allOverdue, allDueSoon, win),
      ...(reviewRows.length > 0
        ? ([
            { kind: "heading", text: "Care reviews" },
            {
              kind: "table",
              columns: [
                { header: "Service user", width: "50%" },
                { header: "Latest review", width: "50%" },
              ],
              rows: reviewRows.map((x) => [
                { text: x.name, strong: true },
                completedCell(x.lastRev?.comp ?? null, x.lastRev?.rag ?? "none"),
              ]),
            },
          ] as ReportBlock[])
        : []),
    ],
  };

  const csvRows: CsvCell[][] = rows.map((r) => {
    const checks = Object.values(r.statusByKey);
    const { overdue, dueSoon } = splitChecks(r.service_user.full_name, checks, win, today);
    return [
      r.service_user.full_name,
      r.service_user.branch_name ?? input.branchName ?? "",
      SERVICE_STATUS_LABELS[r.service_user.service_status],
      r.rollup ? (r.rollup.rag === "none" ? "No checks" : ragLabel(r.rollup.rag)) : "No checks",
      overdue.length,
      dueSoon.length,
    ];
  });
  const csv = buildCsv(
    ["Name", "Branch", "Status", "Compliance", "Overdue checks", "Due checks in period"],
    csvRows,
  );

  return {
    doc,
    csv,
    base: `service-user-register-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}`,
    recordCount: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Shared overdue / due soon list blocks
// ---------------------------------------------------------------------------

function overdueBlocks(overdue: Overdue[], dueSoon: Overdue[], win: ReportWindow): ReportBlock[] {
  return [
    { kind: "heading", text: "Overdue checks" },
    overdueTable(overdue),
    { kind: "heading", text: `Due in the period, up to ${fmtDate(win.to)}` },
    dueTable(dueSoon),
  ];
}

// ---------------------------------------------------------------------------
// Branch / company compliance report (both populations)
// ---------------------------------------------------------------------------

export async function buildComplianceReport(
  input: RegisterReportInput,
): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const scopeLabel = input.branchName ? input.branchName : "Whole company, all branches";
  const win = input.window ?? defaultReportWindow();
  const today = todayIso();
  const [{ rows: pRows }, { rows: sRows }] = await Promise.all([
    listPeopleRegister(input.companyId, input.branchId, "active"),
    listServiceUserRegister(input.companyId, input.branchId, "active"),
  ]);

  const pCounts = summaryCounts(pRows.map((r) => r.rollup?.rag ?? "none"));
  const sCounts = summaryCounts(sRows.map((r) => r.rollup?.rag ?? "none"));

  const pOverdue: Overdue[] = [];
  const pDueSoon: Overdue[] = [];
  for (const r of pRows) {
    const s = splitChecks(r.person.full_name, Object.values(r.statuses), win, today);
    pOverdue.push(...s.overdue);
    pDueSoon.push(...s.dueSoon);
  }
  const sOverdue: Overdue[] = [];
  const sDueSoon: Overdue[] = [];
  for (const r of sRows) {
    const s = splitChecks(r.service_user.full_name, Object.values(r.statusByKey), win, today);
    sOverdue.push(...s.overdue);
    sDueSoon.push(...s.dueSoon);
  }
  const duePeriod = `Due in the period, up to ${fmtDate(win.to)}`;

  const doc: ReportDoc = {
    title: "Compliance report",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `COMP-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Period", value: periodLabel(win) },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote: EXCLUSION_NOTE,
    blocks: [
      { kind: "heading", text: "Compliance summary" },
      {
        kind: "table",
        columns: [
          { header: "Register", width: "28%" },
          { header: "Compliant" },
          { header: "Due soon" },
          { header: "Overdue" },
          { header: "No checks" },
          { header: "Total" },
        ],
        rows: [
          [
            { text: "People", strong: true },
            { text: String(pCounts.green), rag: "green" },
            { text: String(pCounts.amber), rag: "amber" },
            { text: String(pCounts.red), rag: "red" },
            { text: String(pCounts.none), rag: "neutral" },
            { text: String(pCounts.total), strong: true },
          ],
          [
            { text: "Service Users", strong: true },
            { text: String(sCounts.green), rag: "green" },
            { text: String(sCounts.amber), rag: "amber" },
            { text: String(sCounts.red), rag: "red" },
            { text: String(sCounts.none), rag: "neutral" },
            { text: String(sCounts.total), strong: true },
          ],
        ],
      },
      { kind: "heading", text: "People overdue checks" },
      overdueTable(pOverdue),
      { kind: "heading", text: `People ${duePeriod.toLowerCase()}` },
      dueTable(pDueSoon),
      { kind: "heading", text: "Service User overdue checks" },
      overdueTable(sOverdue),
      { kind: "heading", text: `Service User ${duePeriod.toLowerCase()}` },
      dueTable(sDueSoon),
    ],
  };

  const csvRows: CsvCell[][] = [
    ...pOverdue.map((o) => ["People", "Overdue", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...pDueSoon.map((o) => ["People", "Due in period", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...sOverdue.map((o) => ["Service User", "Overdue", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...sDueSoon.map((o) => ["Service User", "Due in period", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
  ];
  const csv = buildCsv(["Register", "Urgency", "Record", "Check", "Due"], csvRows);

  return { doc, csv, base: `compliance-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}` };
}

function overdueTable(overdue: Overdue[]): ReportBlock {
  overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  return {
    kind: "table",
    emptyText: "Nothing overdue in this period.",
    columns: [
      { header: "Name", width: "40%" },
      { header: "Task", width: "40%" },
      { header: "Was due", width: "20%" },
    ],
    rows: overdue.map((o) => [
      { text: o.record },
      { text: o.check },
      { text: fmtDate(o.due), rag: "red" as const },
    ]),
  };
}

function dueTable(dueSoon: Overdue[]): ReportBlock {
  dueSoon.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  return {
    kind: "table",
    emptyText: "Nothing due in this period.",
    columns: [
      { header: "Name", width: "40%" },
      { header: "Task", width: "40%" },
      { header: "Due", width: "20%" },
    ],
    rows: dueSoon.map((o) => [
      { text: o.record },
      { text: o.check },
      { text: fmtDate(o.due), rag: "amber" as const },
    ]),
  };
}

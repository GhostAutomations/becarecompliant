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

import type { Rag } from "@/lib/recurrence";
import { listRegister as listPeopleRegister } from "@/lib/people/data";
import {
  WORKING_STATUS_LABELS,
  PROBATION_STATUS_LABELS,
  type CheckStatus,
  type RegisterRow,
} from "@/lib/people/types";
import { listRegister as listServiceUserRegister } from "@/lib/service-users/data";
import { SERVICE_STATUS_LABELS, type SuCheckStatus, type ServiceUserRow } from "@/lib/service-users/types";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportBlock, ReportDoc } from "@/lib/export/pdf";
import { fmtDate, generatedAt, ragLabel, ragTone } from "@/lib/export/format";

const EXCLUSION_NOTE =
  "Active records only. Leavers, archived people and cancelled or discharged service users are excluded, matching the registers.";

type Overdue = { record: string; check: string; due: string | null };

/** Split a record's checks into overdue (red) and due soon (amber). */
function splitChecks(recordName: string, checks: (CheckStatus | SuCheckStatus)[]): {
  overdue: Overdue[];
  dueSoon: Overdue[];
} {
  const overdue: Overdue[] = [];
  const dueSoon: Overdue[] = [];
  for (const c of checks) {
    if (c.rag === "red") overdue.push({ record: recordName, check: c.check_name, due: c.due_date });
    else if (c.rag === "amber") dueSoon.push({ record: recordName, check: c.check_name, due: c.due_date });
  }
  return { overdue, dueSoon };
}

function ragCell(rag: Rag | "none") {
  if (rag === "none") return { text: "No checks", rag: "neutral" as const };
  return { text: ragLabel(rag), rag: ragTone(rag) };
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
};

export async function buildPeopleRegisterReport(
  input: RegisterReportInput,
): Promise<{ doc: ReportDoc; csv: string; base: string; recordCount: number }> {
  const { rows } = await listPeopleRegister(input.companyId, input.branchId, "active");
  const scopeLabel = input.branchName ? input.branchName : "All branches";

  const counts = summaryCounts(rows.map((r) => r.rollup?.rag ?? "none"));
  const allOverdue: Overdue[] = [];
  const allDueSoon: Overdue[] = [];

  const recordRows = rows.map((r: RegisterRow) => {
    const checks = Object.values(r.statuses);
    const { overdue, dueSoon } = splitChecks(r.person.full_name, checks);
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
      { label: "Generated at", value: generatedAt() },
      { label: "Active people", value: String(counts.total) },
      { label: "Overdue people", value: String(counts.red) },
      { label: "Due soon people", value: String(counts.amber) },
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
          { header: "Due soon", width: "9%", align: "right" },
        ],
        rows: recordRows,
      },
      ...overdueBlocks(allOverdue, allDueSoon),
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
    const overdue = checks.filter((c) => c.rag === "red").length;
    const dueSoon = checks.filter((c) => c.rag === "amber").length;
    const t = r.tracker;
    return [
      r.person.full_name,
      r.person.branch_name ?? input.branchName ?? "",
      WORKING_STATUS_LABELS[r.person.employment_status],
      r.rollup ? (r.rollup.rag === "none" ? "No checks" : ragLabel(r.rollup.rag)) : "No checks",
      overdue,
      dueSoon,
      t?.probation_status ? PROBATION_STATUS_LABELS[t.probation_status] : "",
      fmtDate(t?.probation_end_due),
      fmtDate(t?.probation_extension_date),
      fmtDate(t?.probation_end_actual),
    ];
  });
  const csv = buildCsv(
    ["Name", "Branch", "Working status", "Compliance", "Overdue checks", "Due soon checks", "Probation status", "Probation original end due", "Probation extension date", "Probation actual end"],
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
  const { rows } = await listServiceUserRegister(input.companyId, input.branchId, "active");
  const scopeLabel = input.branchName ? input.branchName : "All branches";

  const counts = summaryCounts(rows.map((r) => r.rollup?.rag ?? "none"));
  const allOverdue: Overdue[] = [];
  const allDueSoon: Overdue[] = [];

  const recordRows = rows.map((r: ServiceUserRow) => {
    const checks = Object.values(r.statusByKey);
    const { overdue, dueSoon } = splitChecks(r.service_user.full_name, checks);
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
      { label: "Generated at", value: generatedAt() },
      { label: "Active service users", value: String(counts.total) },
      { label: "Overdue service users", value: String(counts.red) },
      { label: "Due soon service users", value: String(counts.amber) },
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
          { header: "Due soon", width: "9%", align: "right" },
        ],
        rows: recordRows,
      },
      ...overdueBlocks(allOverdue, allDueSoon),
    ],
  };

  const csvRows: CsvCell[][] = rows.map((r) => {
    const checks = Object.values(r.statusByKey);
    return [
      r.service_user.full_name,
      r.service_user.branch_name ?? input.branchName ?? "",
      SERVICE_STATUS_LABELS[r.service_user.service_status],
      r.rollup ? (r.rollup.rag === "none" ? "No checks" : ragLabel(r.rollup.rag)) : "No checks",
      checks.filter((c) => c.rag === "red").length,
      checks.filter((c) => c.rag === "amber").length,
    ];
  });
  const csv = buildCsv(
    ["Name", "Branch", "Status", "Compliance", "Overdue checks", "Due soon checks"],
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

function overdueBlocks(overdue: Overdue[], dueSoon: Overdue[]): ReportBlock[] {
  const byDue = (a: Overdue, b: Overdue) => (a.due ?? "").localeCompare(b.due ?? "");
  overdue.sort(byDue);
  dueSoon.sort(byDue);
  return [
    { kind: "heading", text: "Overdue checks" },
    {
      kind: "table",
      emptyText: "Nothing overdue. Every check is on track.",
      columns: [
        { header: "Record", width: "40%" },
        { header: "Check", width: "40%" },
        { header: "Was due", width: "20%" },
      ],
      rows: overdue.map((o) => [
        { text: o.record },
        { text: o.check },
        { text: fmtDate(o.due), rag: "red" as const },
      ]),
    },
    { kind: "heading", text: "Due soon" },
    {
      kind: "table",
      emptyText: "Nothing due soon.",
      columns: [
        { header: "Record", width: "40%" },
        { header: "Check", width: "40%" },
        { header: "Due", width: "20%" },
      ],
      rows: dueSoon.map((o) => [
        { text: o.record },
        { text: o.check },
        { text: fmtDate(o.due), rag: "amber" as const },
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Branch / company compliance report (both populations)
// ---------------------------------------------------------------------------

export async function buildComplianceReport(
  input: RegisterReportInput,
): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const scopeLabel = input.branchName ? input.branchName : "Whole company, all branches";
  const [{ rows: pRows }, { rows: sRows }] = await Promise.all([
    listPeopleRegister(input.companyId, input.branchId, "active"),
    listServiceUserRegister(input.companyId, input.branchId, "active"),
  ]);

  const pCounts = summaryCounts(pRows.map((r) => r.rollup?.rag ?? "none"));
  const sCounts = summaryCounts(sRows.map((r) => r.rollup?.rag ?? "none"));

  const pOverdue: Overdue[] = [];
  const pDueSoon: Overdue[] = [];
  for (const r of pRows) {
    const s = splitChecks(r.person.full_name, Object.values(r.statuses));
    pOverdue.push(...s.overdue);
    pDueSoon.push(...s.dueSoon);
  }
  const sOverdue: Overdue[] = [];
  const sDueSoon: Overdue[] = [];
  for (const r of sRows) {
    const s = splitChecks(r.service_user.full_name, Object.values(r.statusByKey));
    sOverdue.push(...s.overdue);
    sDueSoon.push(...s.dueSoon);
  }

  const doc: ReportDoc = {
    title: "Compliance report",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `COMP-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
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
      { kind: "heading", text: "Service User overdue checks" },
      overdueTable(sOverdue),
    ],
  };

  const csvRows: CsvCell[][] = [
    ...pOverdue.map((o) => ["People", "Overdue", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...pDueSoon.map((o) => ["People", "Due soon", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...sOverdue.map((o) => ["Service User", "Overdue", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
    ...sDueSoon.map((o) => ["Service User", "Due soon", o.record, o.check, fmtDate(o.due)] as CsvCell[]),
  ];
  const csv = buildCsv(["Register", "Urgency", "Record", "Check", "Due"], csvRows);

  return { doc, csv, base: `compliance-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}` };
}

function overdueTable(overdue: Overdue[]): ReportBlock {
  overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  return {
    kind: "table",
    emptyText: "Nothing overdue.",
    columns: [
      { header: "Record", width: "40%" },
      { header: "Check", width: "40%" },
      { header: "Was due", width: "20%" },
    ],
    rows: overdue.map((o) => [
      { text: o.record },
      { text: o.check },
      { text: fmtDate(o.due), rag: "red" as const },
    ]),
  };
}

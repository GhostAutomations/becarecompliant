import "server-only";

/**
 * Be Care Compliant: the Overdue, Due in 7 days, Due in 14 days and Due in 30 days reports.
 *
 * Phil, 2026-10-05: four reports, opened from Reports or from the matching dashboard tile. Each
 * is the list behind its tile, in full: the same rows (getDueRows) banded by the same function
 * (dueBandRows), so a report can never disagree with the tile that opened it. Separate bands,
 * as the tiles: today to day 7, days 8 to 14, days 15 to 30.
 *
 * People first, then Service Users (popup). One line per check: name, branch, check, due date,
 * and how late or how far off. Names link to the record on screen. Live, so no date range.
 * Active records only: the status views already leave out leavers, archived and discharged.
 * No dashes in copy.
 */

import { createClient } from "@/lib/supabase/server";
import { getDueRows } from "@/lib/dashboard/data";
import { dueBandRows, daysBetweenIso, recordHref, type DueBand, type DueRow } from "@/lib/dashboard/due-preview";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportDoc, ReportCell } from "@/lib/export/pdf";
import { fmtDate, generatedAt } from "@/lib/export/format";
import { getBranchTerms } from "@/lib/branches/company-word";
import { DUE_REPORTS, type DueReportType } from "@/lib/export/due-report-types";

export type DueReportInput = {
  companyId: string;
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  type: DueReportType;
};

/** "12 days late", "Due today", "Due in 3 days". */
function whenText(dueIso: string | null, todayIso: string): string {
  if (!dueIso) return "No date";
  const n = daysBetweenIso(todayIso, dueIso);
  if (n < 0) return n === -1 ? "1 day late" : `${-n} days late`;
  if (n === 0) return "Due today";
  return n === 1 ? "Due tomorrow" : `Due in ${n} days`;
}

export async function buildDueReport(input: DueReportInput): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const meta = DUE_REPORTS[input.type];
  const band: DueBand = meta.band;
  const [{ rows: all, today }, terms] = await Promise.all([getDueRows(input.companyId), getBranchTerms(input.companyId)]);
  const scoped = input.branchId ? all.filter((r) => r.branchId === input.branchId) : all;
  const rows = dueBandRows(scoped, today, band);

  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id, name").eq("company_id", input.companyId);
  const branchName = new Map(((branches as Array<{ id: string; name: string }> | null) ?? []).map((b) => [b.id, b.name]));

  const scopeLabel = input.branchName ?? terms.all;
  const people = rows.filter((r) => r.kind === "person");
  const sus = rows.filter((r) => r.kind === "service_user");
  const tone = band === "overdue" ? "red" : "amber";

  const line = (r: DueRow): ReportCell[] => [
    { text: r.name, strong: true, href: recordHref(r.kind, r.recordId) },
    { text: (r.branchId && branchName.get(r.branchId)) || "" },
    { text: r.checkName ?? "" },
    { text: r.dueDate ? fmtDate(r.dueDate) : "" },
    { text: whenText(r.dueDate, today), rag: tone },
  ];
  const columns = [
    { header: "Name", width: "24%" },
    { header: terms.one, width: "14%" },
    { header: "Check", width: "28%" },
    { header: "Due", width: "18%" },
    { header: band === "overdue" ? "Late" : "When", width: "16%" },
  ];
  const records = (list: DueRow[]) => new Set(list.map((r) => `${r.kind}:${r.recordId}`)).size;

  const totals =
    band === "overdue"
      ? [
          { label: "Overdue checks", value: String(rows.length) },
          { label: "People", value: String(records(people)) },
          { label: "Service Users", value: String(records(sus)) },
        ]
      : [
          { label: "Checks due", value: String(rows.length) },
          { label: "People checks", value: String(people.length) },
          { label: "Service User checks", value: String(sus.length) },
        ];

  const doc: ReportDoc = {
    title: meta.title,
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `${meta.ref}-${today}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Covers", value: meta.covers },
      ...totals,
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote:
      "Live list, as the registers stand now. Active records only: leavers, archived people and cancelled or discharged service users are excluded. One line per check.",
    blocks: [
      { kind: "heading", text: "People" },
      { kind: "table", columns, rows: people.map(line), emptyText: meta.emptyPeople },
      { kind: "heading", text: "Service Users" },
      { kind: "table", columns, rows: sus.map(line), emptyText: meta.emptyServiceUsers },
    ],
  };

  const csvRows: CsvCell[][] = rows.map((r) => [
    r.kind === "person" ? "Person" : "Service User",
    r.name,
    (r.branchId && branchName.get(r.branchId)) || "",
    r.checkName ?? "",
    r.dueDate ?? "",
    whenText(r.dueDate, today),
  ]);
  const csv = buildCsv(["Register", "Name", terms.one, "Check", "Due date", band === "overdue" ? "Late" : "When"], csvRows);

  return { doc, csv, base: `${meta.slug}-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}` };
}

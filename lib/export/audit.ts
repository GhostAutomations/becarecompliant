import "server-only";

/**
 * Be Care Compliant — audit trail export (Phase 8).
 * Turns a set of audit entries (a record's history, a company log, or a founder
 * cross company view) into a ReportDoc for the shared PDF builder plus a CSV, so
 * an inspector can be handed the trail. Captures action, actor, time, entity and
 * summary (the lean model Phil chose). No dashes in copy.
 */

import type { AuditEntry } from "@/lib/audit-log/data";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportDoc } from "@/lib/export/pdf";
import { fmtDateTime, generatedAt } from "@/lib/export/format";

export type AuditReportInput = {
  title: string;
  subtitle: string;
  reference: string;
  meta: { label: string; value: string }[];
  entries: AuditEntry[];
  /** Show a company column (founder cross company export). */
  showCompany?: boolean;
};

/** A friendly one line description of an audit action. */
function describe(e: AuditEntry): string {
  if (e.summary && e.summary.trim().length > 0) return e.summary;
  return e.action.replace(/[._]/g, " ");
}

export function buildAuditReport(input: AuditReportInput): { doc: ReportDoc; csv: string } {
  const columns = input.showCompany
    ? [
        { header: "When", width: "20%" as const },
        { header: "Company", width: "16%" as const },
        { header: "Actor", width: "20%" as const },
        { header: "Action", width: "18%" as const },
        { header: "Detail", width: "26%" as const },
      ]
    : [
        { header: "When", width: "22%" as const },
        { header: "Actor", width: "22%" as const },
        { header: "Action", width: "20%" as const },
        { header: "Detail", width: "36%" as const },
      ];

  const rows = input.entries.map((e) => {
    const base = [
      { text: fmtDateTime(e.created_at) },
      ...(input.showCompany ? [{ text: e.company_id ? e.company_id.slice(0, 8) : "Platform" }] : []),
      { text: e.actor_email || "System" },
      { text: e.action },
      { text: describe(e) },
    ];
    return base;
  });

  const doc: ReportDoc = {
    title: input.title,
    subtitle: input.subtitle,
    reference: input.reference,
    meta: [...input.meta, { label: "Generated at", value: generatedAt() }, { label: "Entries", value: String(input.entries.length) }],
    footerNote: "Audit trail is append only. Each row records who did what and when.",
    landscape: true,
    blocks: [
      { kind: "heading", text: "Audit trail" },
      {
        kind: "table",
        emptyText: "No audit entries for this selection.",
        columns,
        rows,
      },
    ],
  };

  const csvRows: CsvCell[][] = input.entries.map((e) => {
    const base: CsvCell[] = [fmtDateTime(e.created_at)];
    if (input.showCompany) base.push(e.company_id ?? "Platform");
    base.push(e.actor_email || "System", e.actor_role || "", e.action, e.entity_type, e.entity_id ?? "", describe(e));
    return base;
  });
  const headers = input.showCompany
    ? ["When", "Company", "Actor", "Role", "Action", "Entity type", "Entity id", "Detail"]
    : ["When", "Actor", "Role", "Action", "Entity type", "Entity id", "Detail"];
  const csv = buildCsv(headers, csvRows);

  return { doc, csv };
}

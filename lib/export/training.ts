import "server-only";

/**
 * Be Care Compliant — Training compliance report (PQS).
 * Drawn straight from the Training sub-department records. Two headline PQS rates:
 *   Quality Q1   : % of care workers in full compliance with mandatory training.
 *   Safeguarding : % compliant with the safeguarding course.
 * Compliant means in date (green or amber); expired or not done is non compliant.
 * Active people only, per branch (local authority monitoring is per contract).
 * No dashes in copy.
 */

import { getTrainingMatrix } from "@/lib/training/data";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportDoc, ReportCell } from "@/lib/export/pdf";
import { generatedAt } from "@/lib/export/format";

/** PQS band: 100 = 10, 85 to 99.99 = 7, 70 to 84.99 = 5, 50 to 69.99 = 2, else 0. */
function pqsBand(pct: number | null): number | null {
  if (pct == null) return null;
  if (pct >= 100) return 10;
  if (pct >= 85) return 7;
  if (pct >= 70) return 5;
  if (pct >= 50) return 2;
  return 0;
}

function rateCell(pct: number | null): ReportCell {
  if (pct == null) return { text: "No courses", rag: "neutral" };
  const rag = pct >= 85 ? "green" : pct >= 50 ? "amber" : "red";
  return { text: `${pct.toFixed(1)}%`, rag };
}

function bandCell(band: number | null): ReportCell {
  if (band == null) return { text: "N/A", rag: "neutral" };
  const rag = band >= 10 ? "green" : band >= 5 ? "amber" : "red";
  return { text: String(band), rag };
}

export async function buildTrainingReport(input: {
  companyId: string;
  companyName: string;
  branchId: string | null;
  branchName: string | null;
}): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const matrix = await getTrainingMatrix(input.companyId, input.branchId);
  const scopeLabel = input.branchName ?? "All branches";

  // Per course: compliant (green or amber) over all active people.
  type CourseStat = { name: string; renews: string; mandatory: boolean; safeguarding: boolean; ok: number; total: number };
  const stats: CourseStat[] = matrix.courses.map((c) => {
    let ok = 0;
    let total = 0;
    for (const p of matrix.people) {
      const cell = p.cells[c.id];
      if (!cell) continue;
      total += 1;
      if (cell.rag === "green" || cell.rag === "amber") ok += 1;
    }
    return {
      name: c.name,
      renews: c.renewal_months ? `${c.renewal_months} mo` : "One off",
      mandatory: c.mandatory,
      safeguarding: c.is_safeguarding,
      ok,
      total,
    };
  });
  const pct = (ok: number, total: number) => (total === 0 ? null : Math.round((ok / total) * 1000) / 10);

  const mand = matrix.summary.mandatoryCompliancePct;
  const safe = matrix.summary.safeguardingPct;

  const headlineRows: ReportCell[][] = [
    [{ text: "Mandatory training", strong: true }, rateCell(mand), bandCell(pqsBand(mand))],
    [{ text: "Safeguarding training", strong: true }, rateCell(safe), bandCell(pqsBand(safe))],
  ];

  const courseRows: ReportCell[][] = stats.map((s) => [
    { text: s.name, strong: true },
    { text: s.renews },
    { text: s.mandatory ? "Yes" : "No" },
    { text: `${s.ok} / ${s.total}` },
    rateCell(pct(s.ok, s.total)),
  ]);

  // Action list: mandatory course cells that are expired or not done.
  type Miss = { person: string; course: string; status: string };
  const misses: Miss[] = [];
  const courseById = new Map(matrix.courses.map((c) => [c.id, c]));
  for (const p of matrix.people) {
    for (const c of matrix.courses) {
      if (!c.mandatory) continue;
      const cell = p.cells[c.id];
      if (cell && cell.rag === "red") {
        misses.push({ person: p.full_name, course: courseById.get(c.id)?.name ?? "", status: cell.sub ?? cell.label });
      }
    }
  }
  misses.sort((a, b) => a.course.localeCompare(b.course) || a.person.localeCompare(b.person));
  const missRows: ReportCell[][] = misses.map((m) => [
    { text: m.person, strong: true },
    { text: m.course },
    { text: m.status, rag: "red" },
  ]);

  const doc: ReportDoc = {
    title: "Training compliance report",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `TRAINING-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Active people", value: String(matrix.summary.people) },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote:
      "Compliant means the training is in date (completed and not expired). Expired or not done counts as non compliant. Active people only. PQS score band: 100 percent is 10, 85 to 99.99 is 7, 70 to 84.99 is 5, 50 to 69.99 is 2, under 50 is 0.",
    blocks: [
      { kind: "heading", text: "PQS headline rates" },
      {
        kind: "table",
        emptyText: "No courses configured.",
        columns: [
          { header: "Measure", width: "50%" },
          { header: "Compliance rate", width: "28%" },
          { header: "PQS score", width: "22%" },
        ],
        rows: headlineRows,
      },
      { kind: "heading", text: "By course" },
      {
        kind: "table",
        emptyText: "No courses configured.",
        columns: [
          { header: "Course", width: "40%" },
          { header: "Renews", width: "14%" },
          { header: "Mandatory", width: "14%" },
          { header: "Compliant", width: "16%" },
          { header: "Rate", width: "16%" },
        ],
        rows: courseRows,
      },
      { kind: "heading", text: "Action needed (mandatory, expired or not done)" },
      {
        kind: "table",
        emptyText: "Every active person is compliant with all mandatory training.",
        columns: [
          { header: "Person", width: "40%" },
          { header: "Course", width: "40%" },
          { header: "Status", width: "20%" },
        ],
        rows: missRows,
      },
    ],
  };

  const csvRows: CsvCell[][] = [
    ["Headline", "Mandatory training", mand == null ? "" : `${mand}%`, pqsBand(mand) ?? "", "", ""],
    ["Headline", "Safeguarding training", safe == null ? "" : `${safe}%`, pqsBand(safe) ?? "", "", ""],
    ...stats.map(
      (s) => ["Course", s.name, s.renews, s.mandatory ? "Mandatory" : "Optional", `${s.ok}/${s.total}`, pct(s.ok, s.total) == null ? "" : `${pct(s.ok, s.total)}%`] as CsvCell[],
    ),
    ...misses.map((m) => ["Action", m.person, m.course, m.status, "", ""] as CsvCell[]),
  ];
  const csv = buildCsv(["Row", "Name", "Detail", "Value", "Compliant", "Rate"], csvRows);

  return { doc, csv, base: `training-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}` };
}

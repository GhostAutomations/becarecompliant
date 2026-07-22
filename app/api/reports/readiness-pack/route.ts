import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getFrameworkReadiness, getFrameworkItems, overallScore, type Rag } from "@/lib/framework/data";
import { draftReadinessNarrative } from "@/lib/framework/ai";
import { renderReportPdf, type ReportBlock, type ReportDoc, type RagTone } from "@/lib/export/pdf";
import { pdfResponse, exportError } from "@/lib/export/deliver";

const REG_LABEL: Record<string, string> = {
  ciw: "Care Inspectorate Wales (CIW)",
  cqc: "Care Quality Commission (CQC)",
};
const STATUS_TEXT: Record<Rag, string> = { red: "Action needed", amber: "Attention", green: "On track", none: "Not mapped" };
const TONE: Record<Rag, RagTone> = { red: "red", amber: "amber", green: "green", none: "neutral" };

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Inspection readiness pack: the readiness picture, outstanding items and an AI
 *  narrative, as one branded PDF. Enabled per company (framework_enabled). */
export async function GET() {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context.", 400);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("framework_enabled, regulator, name")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (!company?.framework_enabled) return exportError("Inspection Readiness is not enabled for this company.", 403);
  const regulator = (company.regulator ?? "ciw") as "cqc" | "ciw";

  const [{ requirements }, items, narrativeRes] = await Promise.all([
    getFrameworkReadiness(profile.company_id, regulator),
    getFrameworkItems(profile.company_id, regulator),
    draftReadinessNarrative(),
  ]);
  const overall = overallScore(requirements);
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());

  const blocks: ReportBlock[] = [];
  for (const r of requirements) {
    blocks.push({ kind: "heading", text: `${r.title}  —  ${STATUS_TEXT[r.status]}` });
    const pairs = [
      { label: "Score", value: r.score != null ? `${r.score}%` : "Not mapped" },
      ...(r.checks.total > 0
        ? [{ label: "Checks", value: `${r.checks.overdue} overdue, ${r.checks.dueSoon} due soon, ${r.checks.onTrack} on track` }]
        : []),
      ...r.metrics.map((m) => ({ label: m.label, value: m.pct != null ? `${m.pct}%` : (m.note ?? "n/a") })),
    ];
    blocks.push({ kind: "keyvalues", pairs });

    const it = items.get(r.code) ?? { overdue: [], dueSoon: [] };
    const all = [...it.overdue.map((i) => ({ i, overdue: true })), ...it.dueSoon.map((i) => ({ i, overdue: false }))];
    if (all.length > 0) {
      blocks.push({
        kind: "table",
        caption: "Outstanding items",
        columns: [{ header: "Name", width: "38%" }, { header: "Check", width: "34%" }, { header: "Due", width: "16%" }, { header: "Status", width: "12%" }],
        rows: all.map(({ i, overdue }) => [
          { text: i.recordName, strong: true },
          { text: i.checkName },
          { text: fmt(i.dueDate) },
          { text: overdue ? "Overdue" : "Due soon", rag: (overdue ? "red" : "amber") as RagTone },
        ]),
      });
    }
    blocks.push({ kind: "spacer" });
  }

  // AI narrative, rendered as headings + paragraphs.
  blocks.push({ kind: "heading", text: "Readiness narrative and gaps (AI draft)" });
  if ("ok" in narrativeRes) {
    for (const line of narrativeRes.ok.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("#")) blocks.push({ kind: "heading", text: t.replace(/^#+\s*/, "") });
      else blocks.push({ kind: "paragraph", text: t.replace(/^[-*]\s+/, "•  ") });
    }
  } else {
    blocks.push({ kind: "paragraph", text: `The narrative could not be generated: ${narrativeRes.error}` });
  }

  const doc: ReportDoc = {
    title: "Inspection Readiness Pack",
    subtitle: REG_LABEL[regulator],
    meta: [
      { label: "Provider", value: company.name as string },
      { label: "Regulator", value: REG_LABEL[regulator] },
      { label: "Generated", value: today },
      { label: "Overall readiness", value: overall != null ? `${overall}%` : "n/a" },
    ],
    blocks,
    footerNote: "Preparation aid based on the provider's own live data, not a regulatory rating. The regulator makes its own judgement at inspection.",
  };

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "report.exported",
    entityType: "report",
    entityId: null,
    summary: "Exported inspection readiness pack (PDF)",
    metadata: { report: "readiness_pack", regulator },
  });

  return pdfResponse(await renderReportPdf(doc), "inspection-readiness-pack");
}

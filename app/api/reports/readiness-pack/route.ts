import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getFrameworkReadiness, getFrameworkItems, type Rag } from "@/lib/framework/data";
import { draftReadinessNarrative } from "@/lib/framework/ai";
import { renderReportPdf, type ReportBlock, type ReportDoc, type RagTone } from "@/lib/export/pdf";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { waitingSentence } from "@/lib/framework/waiting";
import { packThemeHeading, packThemePairs } from "@/lib/framework/pack-lines";

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

/** Inspection readiness pack: the readiness picture, outstanding checks and an AI
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

  // Readiness FIRST, then the narrative with that same data. Readiness now runs the six month
  // PQS engine, and a route handler is outside the React tree, so cache() would not have stopped
  // the old Promise.all from running the whole thing twice.
  const [{ requirements: allRequirements }, items, noticesRes] = await Promise.all([
    getFrameworkReadiness(profile.company_id, regulator),
    getFrameworkItems(profile.company_id, regulator),
    supabase
      .from("inspection_notices")
      .select("requirement_code, kind, regulation, description, issued_on, due_by, resolved_on")
      .eq("company_id", profile.company_id)
      .eq("regulator", regulator)
      .order("issued_on", { ascending: false }),
  ]);
  /* THE SAME THEMES AS THE PAGE (Operation Thistle list, number 15, 2026-09-23). A theme nothing feeds is left out, as the
     Readiness page leaves it out: Environment is for services with accommodation, and printing it
     as "Not mapped" in a document for an inspector reads as a gap the provider does not have. */
  const requirements = allRequirements.filter((r) => r.mapped);
  const narrativeRes = await draftReadinessNarrative(requirements);
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());

  const blocks: ReportBlock[] = [];
  /* NO SCORE, NO OVERALL FIGURE (Operation Thistle list, number 15, 2026-09-23). The page stopped showing both on
     2026-09-19, because CIW rates each theme separately, by judgement. The pack kept printing
     "Score: N%" per theme and "Overall readiness: N%" on the cover, so the document handed to an
     inspector said something the screen no longer did. It now says what the page says. */
  for (const r of requirements) {
    blocks.push({ kind: "heading", text: packThemeHeading({ title: r.title, statusText: STATUS_TEXT[r.status] }) });
    const pairs = packThemePairs({
      title: r.title,
      statusText: STATUS_TEXT[r.status],
      reason: r.reason,
      checks: r.checks,
      waitingLine: waitingSentence(r.checks.waiting),
      metrics: r.metrics,
      notices: r.notices,
    });
    blocks.push({ kind: "keyvalues", pairs });

    const it = items.get(r.code) ?? { overdue: [], dueSoon: [] };
    const all = [...it.overdue.map((i) => ({ i, overdue: true })), ...it.dueSoon.map((i) => ({ i, overdue: false }))];
    if (all.length > 0) {
      blocks.push({
        kind: "table",
        caption: "Outstanding checks",
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

  // The regulator's own notices, open first, as the page lists them.
  type NoticeRow = {
    requirement_code: string;
    kind: string;
    regulation: string | null;
    description: string | null;
    issued_on: string;
    due_by: string | null;
    resolved_on: string | null;
  };
  const notices = ((noticesRes.data as NoticeRow[] | null) ?? []).slice().sort(
    (a, b) => Number(!!a.resolved_on) - Number(!!b.resolved_on),
  );
  const themeTitle = new Map(allRequirements.map((r) => [r.code, r.title]));
  blocks.push({ kind: "heading", text: `${regulator === "ciw" ? "CIW" : "CQC"} notices` });
  if (notices.length === 0) {
    blocks.push({ kind: "paragraph", text: "No notices recorded." });
  } else {
    blocks.push({
      kind: "table",
      columns: [
        { header: "Notice", width: "22%" },
        { header: "Theme", width: "22%" },
        { header: "What it says", width: "32%" },
        { header: "Issued", width: "12%" },
        { header: "Status", width: "12%" },
      ],
      rows: notices.map((n) => [
        { text: n.kind === "priority_action" ? "Priority Action Notice" : "Area for Improvement", strong: true },
        { text: themeTitle.get(n.requirement_code) ?? n.requirement_code },
        { text: [n.regulation, n.description].filter(Boolean).join(": ") || "No detail recorded" },
        { text: fmt(n.issued_on) },
        n.resolved_on
          ? { text: `Resolved ${fmt(n.resolved_on)}`, rag: "green" as RagTone }
          : { text: n.due_by ? `Open, due ${fmt(n.due_by)}` : "Open", rag: (n.kind === "priority_action" ? "red" : "amber") as RagTone },
      ]),
    });
  }
  blocks.push({ kind: "spacer" });

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
      { label: "Rating", value: "Each theme is rated separately, with no overall rating" },
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

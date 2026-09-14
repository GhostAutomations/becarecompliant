import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { buildCsv } from "@/lib/export/csv";
import { getSatisfaction, getSatisfactionQuestions } from "@/lib/service-users/satisfaction";

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

function fmt(iso: string | null): string {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
}

/** CSV of the service user satisfaction register + PQS %. Manager+ via RLS. */
export async function GET(_req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return new Response("No company", { status: 403 });
  if (!ALLOWED.includes(profile.role)) return new Response("Forbidden", { status: 403 });

  /* The company's OWN questions, read from their form: the list is theirs to edit. */
  const [sat, questions] = await Promise.all([
    getSatisfaction(profile.company_id),
    getSatisfactionQuestions(profile.company_id),
  ]);
  const qCols = questions.map((q) => q.label);

  const rows = sat.rows
    .filter((r) => r.reviewsInWindow > 0)
    .map((r) => [
      r.full_name,
      r.branch_name ?? "",
      fmt(r.latestReviewAt),
      ...questions.map((q) => r.latestAnswers[q.key] ?? ""),
      r.pct === null ? "" : `${r.pct}%`,
    ]);

  rows.push(["", "", "", ...qCols.map(() => ""), ""]);
  rows.push([
    "OVERALL (PQS)",
    "",
    `${fmt(sat.window.from)} to ${fmt(sat.window.to)}`,
    ...qCols.map(() => ""),
    sat.pct === null ? "" : `${sat.pct}%`,
  ]);

  const csv = buildCsv(["Service user", "Branch", "Last review", ...qCols, "Percent"], rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="satisfaction.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { renderBriefingReport, type ReportPerson } from "@/lib/assignments/report";

/**
 * Who has signed a policy (or completed a form), and who has not — as a PDF,
 * generated live.
 *
 * Phil, 2026-07-27: "we just want a pdf that shows who has signed it and who is
 * outstanding, that pdf updates in real time... i dont think those pdfs will need
 * to save anywhere." So nothing is stored: every press is a fresh read of the
 * assignments table, and the page says what time it was correct at.
 *
 * Scoping is RLS's job, not ours: the caller's own client reads the assignments,
 * so a Branch Manager's report covers their branch and a company-wide role's
 * covers everybody, without a line of permission code here.
 *
 * ?policy=<id> or ?form=<id>
 */
export const dynamic = "force-dynamic";

const MANAGER_PLUS = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

function daysLate(dueDate: string | null, today: string): number | null {
  if (!dueDate || dueDate >= today) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export async function GET(request: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return NextResponse.json({ error: "No company context." }, { status: 400 });
  }
  if (!MANAGER_PLUS.includes(profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const policyId = request.nextUrl.searchParams.get("policy");
  const formId = request.nextUrl.searchParams.get("form");
  if (!policyId && !formId) {
    return NextResponse.json({ error: "Choose a policy or a form." }, { status: 400 });
  }
  const kind: "policy" | "form" = policyId ? "policy" : "form";

  const supabase = await createClient();
  let query = supabase
    .from("assignments")
    .select(
      "id, status, due_date, completed_at, policy_version, people:person_id(full_name, branches:branch_id(name)), company_policies:policy_id(title, version), forms:form_id(name)",
    )
    .eq("company_id", profile.company_id)
    .neq("status", "cancelled");
  query = policyId ? query.eq("policy_id", policyId) : query.eq("form_id", formId as string);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    status: string;
    due_date: string | null;
    completed_at: string | null;
    policy_version: number | null;
    people: { full_name: string; branches: { name: string } | { name: string }[] | null } | null;
    company_policies: { title: string; version: number } | { title: string; version: number }[] | null;
    forms: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const person = one(r.people);
    return {
      status: r.status,
      due_date: r.due_date,
      completed_at: r.completed_at,
      version: r.policy_version,
      name: person?.full_name ?? "Someone",
      branch: one(person?.branches ?? null)?.name ?? null,
      title:
        kind === "policy"
          ? (one(r.company_policies)?.title ?? "Policy")
          : (one(r.forms)?.name ?? "Form"),
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "This has not been sent to anybody yet." }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const done: ReportPerson[] = rows
    .filter((r) => r.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .map((r) => ({ name: r.name, branch: r.branch, doneAt: r.completed_at }));
  const outstanding: ReportPerson[] = rows
    .filter((r) => r.status === "assigned")
    .map((r) => ({
      name: r.name,
      branch: r.branch,
      dueDate: r.due_date,
      daysLate: daysLate(r.due_date, today),
    }))
    // Latest first: the people who have been waiting longest are the ones a
    // manager has to act on.
    .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0) || a.name.localeCompare(b.name));

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id)
    .maybeSingle();

  const pdf = await renderBriefingReport({
    companyName: (company?.name as string | null) ?? "Your company",
    title: rows[0].title,
    kind,
    version: kind === "policy" ? (rows[0].version ?? null) : null,
    generatedAt: new Date(),
    done,
    outstanding,
  });

  await writeAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.report_downloaded",
    entityType: kind === "policy" ? "policy" : "form",
    entityId: policyId ?? formId,
    summary: `Checked who has responded to "${rows[0].title}"`,
    metadata: { done: done.length, outstanding: outstanding.length },
  });

  const safe = rows[0].title.replace(/[^a-zA-Z0-9 _-]+/g, "").trim().slice(0, 60) || "briefing";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe} - who has signed.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getFrameworkReadiness,
  getFrameworkItems,
  type Rag,
  type FrameworkItem,
} from "@/lib/framework/data";
import AssistantPanel from "@/components/framework/assistant-panel";
import SnapshotOnLoad from "@/components/framework/snapshot-on-load";
import NoticesPanel, { type NoticeRow } from "@/components/framework/notices-panel";
import { waitingSentence } from "@/lib/framework/waiting";
import DownloadButton from "@/components/download-button";
import InspectionPanel from "@/components/framework/inspection-panel";
import { resolveReadinessBranch, getLatestInspections } from "@/lib/framework/branches";
import { ratingLabel, ratingTone } from "@/lib/framework/ratings";
import { getBranchTerms } from "@/lib/branches/company-word";

export const metadata: Metadata = { title: "Inspection Readiness" };

const ALLOWED = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
];

const REGULATOR_LABEL: Record<string, string> = {
  ciw: "Care Inspectorate Wales (CIW)",
  cqc: "Care Quality Commission (CQC)",
};
const PILL: Record<Rag, string> = { red: "pill-red", amber: "pill-amber", green: "pill-green", none: "pill-neutral" };
const STATUS_TEXT: Record<Rag, string> = { red: "Action needed", amber: "Attention", green: "On track", none: "Not mapped" };

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function ItemRow({ item, overdue }: { item: FrameworkItem; overdue: boolean }) {
  const base = item.population === "people" ? "people" : "service-users";
  return (
    <Link
      href={`/${base}/${item.recordId}/checks/${item.instanceId}/complete`}
      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:border-gold-400/40 hover:bg-gold-400/10"
    >
      <span className="min-w-0 truncate">
        <span className="font-medium text-white">{item.recordName}</span>
        <span className="text-white/50"> · {item.checkName}</span>
      </span>
      <span className={`shrink-0 text-xs ${overdue ? "text-red-300" : "text-amber-200"}`}>
        {overdue ? "Overdue" : "Due"} {fmt(item.dueDate)}
      </span>
    </Link>
  );
}

const TONE_PILL = { green: "pill-green", amber: "pill-amber", red: "pill-red" } as const;
/* Who may record an inspection: the same people RLS lets write branch_inspections. */
const RECORDERS = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("framework_enabled, regulator, name")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (!company?.framework_enabled) redirect("/dashboard");
  const regulator = (company.regulator ?? "ciw") as "cqc" | "ciw";

  /* PER REGISTERED SERVICE (0363, Phil 2026-10-01). CIW inspected Thistle Care (Cardiff) and
     Thistle Care (Gwent) separately, each with its own report, ratings and notices, so readiness is
     shown one branch at a time. A company with no registered service sees every branch together. */
  const { branch, branches } = await resolveReadinessBranch(profile.company_id, sp.branch);
  const branchId = branch?.id ?? null;
  const bw = await getBranchTerms(profile.company_id);

  let noticeQuery = supabase
    .from("inspection_notices")
    .select("id, requirement_code, kind, regulation, description, issued_on, due_by, resolved_on")
    .eq("company_id", profile.company_id)
    .eq("regulator", regulator);
  if (branchId) noticeQuery = noticeQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
  const [{ requirements: allRequirements }, items, noticesRes, inspections] = await Promise.all([
    getFrameworkReadiness(profile.company_id, regulator, branchId),
    getFrameworkItems(profile.company_id, regulator, branchId),
    noticeQuery.order("issued_on", { ascending: false }),
    getLatestInspections(profile.company_id, regulator),
  ]);
  const last = branchId ? inspections.get(branchId) ?? null : null;
  const notices = (noticesRes.data as NoticeRow[] | null) ?? [];
  /* A theme nothing feeds is not shown: Environment is for services with accommodation, and CIW
     does not rate a domiciliary service on it. */
  const requirements = allRequirements.filter((r) => r.mapped);

  return (
    <div className="page-shell space-y-6">
      <SnapshotOnLoad key={branchId ?? "all"} branchId={branchId} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">Inspection Readiness</h1>
          </div>
          <p className="page-subtitle">
            Where your evidence stands against each {REGULATOR_LABEL[regulator]} theme. The regulator rates each theme separately, with no overall rating. Click an area to see and fix the
            outstanding checks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadButton
            href={branchId ? `/api/reports/readiness-pack?branch=${branchId}` : "/api/reports/readiness-pack"}
            label="Inspection pack"
            busyLabel="Preparing the pack…"
            busyNote="This takes about 20 seconds. The download starts on its own."
            fallbackName="inspection-readiness-pack.pdf"
          />
        </div>
      </div>

      {branches.length > 1 ? (
        <nav aria-label={`Choose a ${bw.oneLower}`} className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/readiness?branch=${b.id}`}
              aria-current={b.id === branchId ? "page" : undefined}
              className={b.id === branchId ? "btn-primary px-3 py-1.5 text-sm" : "btn-outline px-3 py-1.5 text-sm"}
            >
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {branch ? (
        <p className="text-sm text-white/60">
          Showing <span className="font-semibold text-white">{branch.name}</span>. {regulator.toUpperCase()} inspects and rates each registered {bw.oneLower} on its own.
        </p>
      ) : (
        <p className="text-sm text-amber-300">
          No {bw.oneLower} is marked as registered with {regulator.toUpperCase()} as its own service, so this shows every {bw.oneLower} together. Tick it on each {bw.oneLower} in Settings.
        </p>
      )}

      {branch ? (
        <InspectionPanel
          regulator={regulator}
          branchId={branch.id}
          branchName={branch.name}
          themes={requirements.map((r) => ({ code: r.code, title: r.title }))}
          last={last ? { inspectedOn: last.inspectedOn, publishedOn: last.publishedOn, ratings: last.ratings, notes: last.notes } : null}
          canRecord={RECORDERS.includes(profile.role)}
        />
      ) : null}

      <div className="space-y-3">
        {requirements.map((r) => {
          const it = items.get(r.code) ?? { overdue: [], dueSoon: [] };
          const outstanding = it.overdue.length + it.dueSoon.length;
          return (
            <div key={r.code} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-white">{r.title}</h2>
                  <p className="mt-0.5 text-sm text-white/60">{r.description}</p>
                </div>
                <span className={`pill ${PILL[r.status]} shrink-0`}>{STATUS_TEXT[r.status]}</span>
              </div>
              {last?.ratings[r.code] ? (
                <p className="mt-2 text-xs text-white/60">
                  Rated{" "}
                  <span className={`pill ${TONE_PILL[ratingTone(regulator, last.ratings[r.code]) ?? "green"]}`}>
                    {ratingLabel(regulator, last.ratings[r.code])}
                  </span>{" "}
                  at the last inspection, {fmt(last.inspectedOn)}
                </p>
              ) : null}

              {/* THE PARTS, NOT A BLENDED SCORE (Phil, 2026-09-19): CIW rates a theme by
                  judgement, so the page shows what the judgement would be looking at. */}
              <p className="mt-3 text-sm text-white/80">{r.reason}</p>
              {r.checks.total > 0 ? (
                <p className="mt-1 text-xs text-white/60">
                  {`${r.checks.overdue} overdue · ${r.checks.dueSoon} due soon · ${r.checks.onTrack} on track`}
                </p>
              ) : null}
              {/* Not when the reason line above already says exactly this. */}
              {r.notices.priority + r.notices.improvement > 0 &&
              r.reason !==
                [
                  r.notices.priority > 0 ? `${r.notices.priority} Priority Action ${r.notices.priority === 1 ? "Notice" : "Notices"} open` : null,
                  r.notices.improvement > 0 ? `${r.notices.improvement} ${r.notices.improvement === 1 ? "Area" : "Areas"} for Improvement open` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") ? (
                <p className="mt-1 text-xs text-amber-300">
                  {[
                    r.notices.priority > 0
                      ? `${r.notices.priority} Priority Action ${r.notices.priority === 1 ? "Notice" : "Notices"} open`
                      : null,
                    r.notices.improvement > 0
                      ? `${r.notices.improvement} ${r.notices.improvement === 1 ? "Area" : "Areas"} for Improvement open`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}

              {/* OUTSIDE the score block on purpose. Checks with no due date are not in the score,
                  and a requirement whose only evidence is unscheduled scores nothing at all, so
                  putting this line inside the score branch hid it in the one case it exists for. */}
              {r.checks.unscheduled > 0 ? (
                <p className="mt-2 text-xs text-amber-300">
                  {r.checks.unscheduled} {r.checks.unscheduled === 1 ? "check has" : "checks have"} no
                  due date, so {r.checks.unscheduled === 1 ? "it is" : "they are"} not counted here.
                </p>
              ) : null}

              {/* Checks waiting on an earlier one (Phil, 2026-09-23): not a gap, so not amber,
                  and each says what it is waiting for. */}
              {waitingSentence(r.checks.waiting) ? (
                <p className="mt-1 text-xs text-white/60">{waitingSentence(r.checks.waiting)}</p>
              ) : null}

              {r.metrics.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
                  {r.metrics.map((m) => (
                    <span key={m.label}>{m.label}: <span className="text-white/90">{m.pct != null ? `${m.pct}%` : (m.note ?? "No data yet")}</span></span>
                  ))}
                </div>
              ) : null}

              {outstanding > 0 ? (
                <details className="section-card mt-3">
                  <summary>Outstanding checks ({outstanding})</summary>
                  <div className="space-y-1 border-t border-white/10 p-3">
                    {it.overdue.map((i) => <ItemRow key={i.instanceId} item={i} overdue />)}
                    {it.dueSoon.map((i) => <ItemRow key={i.instanceId} item={i} overdue={false} />)}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>

      <NoticesPanel
        regulatorName={regulator.toUpperCase()}
        themes={requirements.map((r) => ({ code: r.code, title: r.title }))}
        notices={notices}
        branchId={branchId}
        branchName={branch?.name ?? null}
      />

      <AssistantPanel key={branchId ?? "all"} branchId={branchId} requirements={requirements.map((r) => ({ code: r.code, title: r.title }))} />

      <p className="text-xs text-white/40">
        Readiness is a live view of your own data and a preparation aid, not a rating. The regulator makes its
        own judgement at inspection.
      </p>
    </div>
  );
}

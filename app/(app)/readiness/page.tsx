import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getFrameworkReadiness,
  getFrameworkItems,
  getReadinessTrend,
  overallScore,
  type Rag,
  type FrameworkItem,
} from "@/lib/framework/data";
import AssistantPanel from "@/components/framework/assistant-panel";
import SnapshotOnLoad from "@/components/framework/snapshot-on-load";

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
function barColour(score: number): string {
  if (score >= 85) return "bg-rag-green";
  if (score >= 50) return "bg-rag-amber";
  return "bg-rag-red";
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

export default async function ReadinessPage() {
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

  const [{ requirements }, items, trend] = await Promise.all([
    getFrameworkReadiness(profile.company_id, regulator),
    getFrameworkItems(profile.company_id, regulator),
    getReadinessTrend(profile.company_id),
  ]);

  const overall = overallScore(requirements);
  const overallRag: Rag = requirements.reduce<Rag>((acc, r) => {
    const rank = { none: 0, green: 1, amber: 2, red: 3 };
    return rank[r.status] > rank[acc] ? r.status : acc;
  }, "green");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SnapshotOnLoad />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">Inspection Readiness</h1>
            <span className={`pill ${PILL[overallRag]}`}>{STATUS_TEXT[overallRag]}</span>
          </div>
          <p className="page-subtitle">
            How your live compliance maps to {REGULATOR_LABEL[regulator]}. Click an area to see and fix the
            outstanding items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overall != null ? (
            <div className="text-right">
              <div className="text-3xl font-bold text-white">{overall}%</div>
              <div className="text-[11px] uppercase tracking-wide text-white/40">Readiness</div>
            </div>
          ) : null}
          <a href="/api/reports/readiness-pack" className="btn-primary text-sm">Inspection pack</a>
        </div>
      </div>

      <div className="space-y-3">
        {requirements.map((r) => {
          const it = items.get(r.code) ?? { overdue: [], dueSoon: [] };
          const outstanding = it.overdue.length + it.dueSoon.length;
          const prev = trend.get(r.code);
          const delta = r.score != null && prev != null ? r.score - prev : null;
          return (
            <div key={r.code} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-white">{r.title}</h2>
                  <p className="mt-0.5 text-sm text-white/60">{r.description}</p>
                </div>
                <span className={`pill ${PILL[r.status]} shrink-0`}>{STATUS_TEXT[r.status]}</span>
              </div>

              {r.score != null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>
                      Score {r.score}%
                      {delta != null && delta !== 0 ? (
                        <span className={delta > 0 ? "text-rag-green" : "text-rag-red"}>
                          {" "}{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                        </span>
                      ) : delta === 0 ? <span className="text-white/40"> no change</span> : null}
                    </span>
                    {r.checks.total > 0 ? (
                      <span>{r.checks.overdue} overdue · {r.checks.dueSoon} due soon · {r.checks.onTrack} on track</span>
                    ) : null}
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full ${barColour(r.score)}`} style={{ width: `${r.score}%` }} />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-white/40">No evidence mapped to this area yet.</p>
              )}

              {r.metrics.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
                  {r.metrics.map((m) => (
                    <span key={m.label}>{m.label}: <span className="text-white/90">{m.pct != null ? `${m.pct}%` : (m.note ?? "—")}</span></span>
                  ))}
                </div>
              ) : null}

              {outstanding > 0 ? (
                <details className="section-card mt-3">
                  <summary>Outstanding items ({outstanding})</summary>
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

      <AssistantPanel requirements={requirements.map((r) => ({ code: r.code, title: r.title }))} />

      <p className="text-xs text-white/40">
        Readiness is a live view of your own data and a preparation aid, not a rating. The regulator makes its
        own judgement at inspection.
      </p>
    </div>
  );
}

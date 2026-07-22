import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkReadiness, type Rag } from "@/lib/framework/data";

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

const PILL: Record<Rag, string> = {
  red: "pill-red",
  amber: "pill-amber",
  green: "pill-green",
  none: "pill-neutral",
};
const STATUS_TEXT: Record<Rag, string> = {
  red: "Action needed",
  amber: "Attention",
  green: "On track",
  none: "Not mapped",
};

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

  const { requirements } = await getFrameworkReadiness(profile.company_id, regulator);

  const overall: Rag = requirements.reduce<Rag>((acc, r) => {
    const rank = { none: 0, green: 1, amber: 2, red: 3 };
    return rank[r.status] > rank[acc] ? r.status : acc;
  }, "green");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Inspection Readiness</h1>
          <span className={`pill ${PILL[overall]}`}>{STATUS_TEXT[overall]}</span>
        </div>
        <p className="page-subtitle">
          How your live compliance maps to {REGULATOR_LABEL[regulator]}. Each area rolls up the
          checks and measures that evidence it.
        </p>
      </div>

      <div className="space-y-3">
        {requirements.map((r) => (
          <div key={r.code} className="glass-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">{r.title}</h2>
                <p className="mt-0.5 text-sm text-white/60">{r.description}</p>
              </div>
              <span className={`pill ${PILL[r.status]} shrink-0`}>{STATUS_TEXT[r.status]}</span>
            </div>

            {r.checks.total > 0 || r.metrics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {r.checks.total > 0 ? (
                  <span className="text-white/70">
                    Checks:{" "}
                    <span className={r.checks.overdue > 0 ? "font-semibold text-red-300" : "text-white/80"}>
                      {r.checks.overdue} overdue
                    </span>
                    {", "}
                    <span className={r.checks.dueSoon > 0 ? "text-amber-200" : "text-white/60"}>
                      {r.checks.dueSoon} due soon
                    </span>
                    {", "}
                    <span className="text-white/60">{r.checks.onTrack} on track</span>
                  </span>
                ) : null}
                {r.metrics.map((m) => (
                  <span key={m.label} className="text-white/70">
                    {m.label}:{" "}
                    <span className="text-white/90">{m.pct != null ? `${m.pct}%` : (m.note ?? "—")}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/40">No evidence mapped to this area yet.</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-white/40">
        Readiness is a live view of your own data and a preparation aid, not a rating. The regulator
        makes its own judgement at inspection.
      </p>
    </div>
  );
}

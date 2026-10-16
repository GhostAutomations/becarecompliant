import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import ActionForm from "@/components/rota/rota-action";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import { concernDecideAction } from "@/lib/rota/concern-actions";
import { CONCERN_STATUS_WORDS } from "@/lib/rota/notes";
import { dayLabel, hhmm } from "@/lib/rota/types";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Concerns" };
}

function londonWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * Concerns raised by carers at visits (Rota and Visits Stage 5, Phil 2026-10-16; docs/decisions/
 * rota-visits.md, Stage 5 decision 9). The supervisor decides whether an incident form is needed:
 * Start an incident form (filled in from the concern), or No incident form needed with the reason.
 * Waiting ones first. For the rota office of the branch (RLS); viewing is audit logged.
 */
export default async function RotaConcernsPage({ searchParams }: { searchParams: Promise<{ branch?: string; concern?: string; show?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const supabase = await createClient();
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  // Opened from a notification: show the concern's own branch.
  let focusBranch: string | null = null;
  if (sp.concern && /^[0-9a-f-]{36}$/i.test(sp.concern)) {
    const { data } = await supabase.from("rota_concerns").select("branch_id").eq("id", sp.concern).maybeSingle<{ branch_id: string }>();
    focusBranch = data?.branch_id ?? null;
  }
  const branch = branches.find((b) => b.id === (focusBranch ?? sp.branch)) ?? branches[0] ?? null;
  const showAll = sp.show === "all" || Boolean(focusBranch);

  type C = {
    id: string;
    service_user_id: string;
    author_name: string;
    category: string;
    body: string;
    happened_at: string;
    status: "open" | "incident" | "no_incident";
    decided_at: string | null;
    decision_note: string | null;
    incident_id: string | null;
    flags: string[] | null;
    service_users: { full_name: string } | null;
    rota_visits: { visit_date: string; start_time: string } | null;
    decider: { full_name: string | null } | null;
  };
  let concerns: C[] = [];
  if (branch) {
    let q = supabase
      .from("rota_concerns")
      .select(
        "id, service_user_id, author_name, category, body, happened_at, status, decided_at, decision_note, incident_id, flags, service_users(full_name), rota_visits(visit_date, start_time), decider:profiles!rota_concerns_decided_by_fkey(full_name)",
      )
      .eq("branch_id", branch.id)
      .order("happened_at", { ascending: false })
      .limit(200);
    if (!showAll) q = q.eq("status", "open");
    const { data } = await q;
    concerns = (data as unknown as C[] | null) ?? [];
    // Waiting for a decision first, then newest first.
    concerns.sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || Date.parse(b.happened_at) - Date.parse(a.happened_at));
    if (concerns.length) {
      await writeAudit({
        companyId,
        actorId: profile.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        action: "rota.concerns_viewed",
        entityType: "branch",
        entityId: branch.id,
        summary: `Viewed ${concerns.length} concern${concerns.length === 1 ? "" : "s"} raised at visits`,
        metadata: { show: showAll ? "all" : "open" },
      });
    }
  }
  const href = (b: string, all: boolean) => `/rota/concerns?branch=${b}${all ? "&show=all" : ""}`;

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Concerns</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">
          Concerns carers raised at visits. Read each one and decide whether an incident form is needed. Safeguarding is decided on the incident.
        </p>
      </div>
      {branch ? <RotaTabs active="concerns" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={href(b.id, showAll)} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {!branch ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}

      {branch ? (
        <>
          <nav aria-label="Which concerns" className="flex flex-wrap gap-2">
            <Link href={href(branch.id, false)} className={`btn px-3 py-1.5 text-xs ${!showAll ? "btn-primary" : "btn-ghost"}`}>
              Waiting for a decision
            </Link>
            <Link href={href(branch.id, true)} className={`btn px-3 py-1.5 text-xs ${showAll ? "btn-primary" : "btn-ghost"}`}>
              All
            </Link>
          </nav>

          {concerns.length === 0 ? (
            <div className="glass-card p-5 text-sm text-white/60">
              {showAll ? "No concerns have been raised at visits in this branch." : "No concerns are waiting for a decision."}
            </div>
          ) : (
            <div className="space-y-3">
              {concerns.map((c) => (
                <section
                  key={c.id}
                  id={`concern-${c.id}`}
                  className={`glass-card space-y-2 p-4 ${c.id === sp.concern ? "border-amber-500/60" : ""} ${c.status === "open" ? "border-red-500/30" : ""}`}
                  aria-label={`Concern for ${c.service_users?.full_name ?? "a service user"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {c.category}: {c.service_users?.full_name ?? "A service user"}
                      </p>
                      <p className="text-xs text-white/55">
                        Raised by {c.author_name}, {londonWhen(c.happened_at)}
                        {c.rota_visits ? ` · at the ${dayLabel(c.rota_visits.visit_date)} ${hhmm(c.rota_visits.start_time)} visit` : ""}
                        {c.flags?.includes("offline") ? " · recorded offline, sent later" : ""}
                      </p>
                    </div>
                    <span className={`pill ${c.status === "open" ? "pill-red" : "pill-neutral"}`}>{CONCERN_STATUS_WORDS[c.status]}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-white/90">{c.body}</p>
                  <p className="text-xs">
                    <Link href={`/service-users/${c.service_user_id}/care-notes`} className="text-amber-300 underline">
                      Care notes for {c.service_users?.full_name ?? "this service user"}
                    </Link>
                  </p>

                  {c.status === "open" ? (
                    <div className="space-y-2 border-t border-white/10 pt-2">
                      <Link href={`/incidents/new?concern=${c.id}`} className="btn-primary inline-block px-3 py-1.5 text-xs">
                        Start an incident form
                      </Link>
                      <ActionForm
                        action={concernDecideAction}
                        hidden={{ concern_id: c.id, decision: "no_incident" }}
                        label="No incident form needed"
                        savingLabel="Saving…"
                        savedLabel="Saved"
                        buttonClassName="btn-outline px-3 py-1.5 text-xs"
                        className="flex flex-wrap items-end gap-2"
                      >
                        <label className="min-w-[14rem] flex-1">
                          <span className="sr-only">Why no incident form is needed</span>
                          <input type="text" name="note" maxLength={1000} required placeholder="Why no incident form is needed" />
                        </label>
                      </ActionForm>
                    </div>
                  ) : c.status === "no_incident" ? (
                    <div className="space-y-1 border-t border-white/10 pt-2 text-xs text-white/70">
                      <p>
                        No incident form needed{c.decider?.full_name ? `, decided by ${c.decider.full_name}` : ""}
                        {c.decided_at ? ` on ${londonWhen(c.decided_at)}` : ""}: {c.decision_note}
                      </p>
                      <ActionForm
                        action={concernDecideAction}
                        hidden={{ concern_id: c.id, decision: "open" }}
                        label="Reopen"
                        savingLabel="Reopening…"
                        savedLabel="Reopened"
                        buttonClassName="btn-ghost px-2 py-1 text-xs"
                        className=""
                        confirm="Reopen this concern so it waits for a decision again?"
                      />
                    </div>
                  ) : (
                    <p className="border-t border-white/10 pt-2 text-xs text-white/70">
                      Incident form started{c.decider?.full_name ? ` by ${c.decider.full_name}` : ""}
                      {c.decided_at ? ` on ${londonWhen(c.decided_at)}` : ""}.{" "}
                      {c.incident_id ? (
                        <Link href={`/incidents/${c.incident_id}`} className="text-amber-300 underline">
                          Open the incident
                        </Link>
                      ) : null}
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

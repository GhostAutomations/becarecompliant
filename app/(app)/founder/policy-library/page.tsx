import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { createServiceClient } from "@/lib/supabase/admin";
import { approveChange, checkOneSource, syncAndCheckAll } from "@/lib/policies/founder-actions";
import { RECHECK_DAYS } from "@/lib/policies/library-sync";

/**
 * Founder: the policy guidance library (Phil, 2026-10-06). Every source the AI writes from, when
 * it was last checked, and any change waiting for approval. Re-checked every 28 days by the
 * cron; nothing a company's AI reads changes until it is approved here.
 */

export const metadata: Metadata = { title: "Policy library" };
export const maxDuration = 300;

type Row = {
  id: string;
  key: string;
  publisher: string;
  title: string;
  url: string;
  regions: string[];
  current_text: string | null;
  checked_at: string | null;
  approved_at: string | null;
  pending_summary: string | null;
  pending_found_at: string | null;
  last_error: string | null;
};

function day(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
}

export default async function FounderPolicyLibraryPage() {
  await requirePlatformAdmin();
  const db = createServiceClient();
  const [{ data: sources }, { data: topics }] = await Promise.all([
    db
      .from("policy_sources")
      .select("id, key, publisher, title, url, regions, current_text, checked_at, approved_at, pending_summary, pending_found_at, last_error")
      .eq("active", true)
      .order("publisher")
      .order("title"),
    db.from("policy_topics").select("key, title, source_keys").order("sort"),
  ]);
  /* Red and amber first (Phil, 2026-10-06: "amber and red need to be at the top of the lists so
     we can see them easy"): could not be read or not loaded, then a change waiting, then loaded. */
  const rank = (r: Row) => (r.last_error || !r.current_text ? 0 : r.pending_summary ? 1 : 2);
  const rows = [...((sources as Row[] | null) ?? [])].sort((a, b) => rank(a) - rank(b));
  const pending = rows.filter((r) => r.pending_summary);
  const failed = rows.filter((r) => r.last_error);
  const loaded = rows.filter((r) => r.current_text).length;
  const usedBy = new Map<string, string[]>();
  for (const t of (topics as Array<{ key: string; title: string; source_keys: string[] }> | null) ?? []) {
    for (const k of t.source_keys) usedBy.set(k, [...(usedBy.get(k) ?? []), t.title]);
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Policy library</h1>
        <p className="page-subtitle">
          The official sources the policy AI writes from. Each is checked every {RECHECK_DAYS} days. When a page
          changes, the change waits here with a summary, and companies see nothing until you approve it.
        </p>
      </div>

      <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-white/70">
          {rows.length === 0
            ? "The library has not been loaded yet."
            : `${loaded} of ${rows.length} sources loaded. ${pending.length} waiting for approval. ${failed.length} could not be read.`}
        </p>
        <ActionForm action={syncAndCheckAll} label="Load and check every source now" savingLabel="Checking… (about a minute)" />
      </div>

      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Waiting for your approval</h2>
          {pending.map((r) => (
            <div key={r.id} className="glass-card space-y-3 p-5">
              <div>
                <p className="text-sm font-semibold text-white">{r.title}</p>
                <p className="text-xs text-white/50">
                  {r.publisher} · found {day(r.pending_found_at)} ·{" "}
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-gold-300 hover:underline">Open the page</a>
                </p>
              </div>
              <p className="whitespace-pre-line text-sm text-white/80">{r.pending_summary}</p>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={approveChange} hidden={{ source_id: r.id, tell: "1" }} label="Approve and tell companies" />
                <ActionForm
                  action={approveChange}
                  hidden={{ source_id: r.id, tell: "0" }}
                  label="Approve quietly (no change in substance)"
                  buttonClassName="btn-outline text-xs"
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Sources</h2>
        {rows.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Press the button above to load the library.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-white hover:underline">
                    {r.title}
                  </a>
                  <p className="text-xs text-white/50">
                    {r.publisher} · {r.regions.map((x) => (x === "wales" ? "Wales" : "England")).join(" and ")} · checked{" "}
                    {day(r.checked_at)} · approved {day(r.approved_at)}
                  </p>
                  {usedBy.get(r.key)?.length ? (
                    <p className="text-xs text-white/40">Used by: {usedBy.get(r.key)!.join(", ")}</p>
                  ) : null}
                  {r.last_error ? <p className="form-error">{r.last_error}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {r.pending_summary ? (
                    <span className="pill pill-amber">Change waiting</span>
                  ) : r.current_text ? (
                    <span className="pill pill-green">Loaded</span>
                  ) : (
                    <span className="pill pill-red">Not loaded</span>
                  )}
                  <ActionForm action={checkOneSource} hidden={{ key: r.key }} label="Check now" buttonClassName="btn-ghost text-xs" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

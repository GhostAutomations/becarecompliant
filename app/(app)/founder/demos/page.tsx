import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { createDemo } from "@/lib/founder/demo-actions";
import { listDemos } from "@/lib/demo/founder-data";
import { DEFAULT_DEMO_DAYS, demoDeleteAt, formatActiveTime, formatDemoDate, type DemoPhase } from "@/lib/demo/rules";

/**
 * FOUNDER > DEMOS (0356, Phil 2026-09-30). A fresh Demo Care Company Limited for each client, full
 * of made up data, with a login whose password the client chooses from the emailed link. Each demo shows how much it was
 * used and what the client thought of it, and stays listed after its company is deleted.
 */
export const metadata: Metadata = { title: "Demos" };

const PHASE_PILL: Record<DemoPhase, { label: string; cls: string }> = {
  active: { label: "Running", cls: "pill-green" },
  survey: { label: "Ends soon", cls: "pill-amber" },
  ended: { label: "Ended", cls: "pill-neutral" },
  purge_due: { label: "Ended", cls: "pill-neutral" },
};

export default async function DemosPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; name?: string; email?: string; request?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const demos = await listDemos();

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/founder" label="Back to Founder" />
      <div>
        <h1 className="page-title">Demos</h1>
        <p className="page-subtitle">
          A fresh Demo Care Company Limited for each client, full of made up records. No SMS, no
          new logins, 5 AI credits per login. Logins stop at the end date and the company is
          deleted 14 days later.
        </p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Set up a demo</h2>
        <p className="mt-1 text-xs text-white/50">
          Takes a few seconds: the company is built, filled with sample data and the login made.
          The client is emailed a button to choose their own password, and how to get started. You
          never set or see their password.
        </p>
        <ActionForm action={createDemo} hidden={{ trial_request_id: sp.request ?? "" }} label="Set up the demo" savingLabel="Setting up…" savedLabel="Done" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="client_name" className="form-label">Who is it for (company or name) *</label>
              <input id="client_name" name="client_name" required maxLength={120} defaultValue={sp.client ?? ""} />
            </div>
            <div>
              <label htmlFor="days" className="form-label">How many days</label>
              <input id="days" name="days" inputMode="numeric" placeholder={String(DEFAULT_DEMO_DAYS)} />
              <p className="form-hint">Blank is {DEFAULT_DEMO_DAYS} days. Any length from 1 to 365.</p>
            </div>
            <div>
              <label htmlFor="full_name" className="form-label">Their name *</label>
              <input id="full_name" name="full_name" required defaultValue={sp.name ?? ""} />
            </div>
            <div>
              <label htmlFor="email" className="form-label">Their email (the login) *</label>
              <input id="email" name="email" type="email" required defaultValue={sp.email ?? ""} />
            </div>
          </div>
        </ActionForm>
      </section>

      {demos.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">No demos yet. Set one up above.</div>
      ) : (
        <section className="glass-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white/50">
                <th className="px-4 py-3 font-medium">Demo for</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Ends</th>
                <th className="px-4 py-3 font-medium">Logins</th>
                <th className="px-4 py-3 font-medium">Time used</th>
                <th className="px-4 py-3 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => {
                const pill = d.deletedAt ? { label: "Deleted", cls: "pill-neutral" } : PHASE_PILL[d.phase];
                return (
                  <tr key={d.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <Link href={`/founder/demos/${d.id}`} className="font-medium text-white underline decoration-white/30 hover:decoration-white">
                        Demo for {d.clientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><span className={pill.cls}>{pill.label}</span></td>
                    <td className="px-4 py-3 text-white/70">
                      {formatDemoDate(d.endsAt)}
                      {!d.deletedAt && (d.phase === "ended" || d.phase === "purge_due") ? (
                        <span className="block text-xs text-white/40">Deleted {formatDemoDate(demoDeleteAt(d.endsAt).toISOString())}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/70">{d.usage.logins} sign ins, {d.logins.length} {d.logins.length === 1 ? "login" : "logins"}</td>
                    <td className="px-4 py-3 text-white/70">{formatActiveTime(d.usage.totalSeconds)}</td>
                    <td className="px-4 py-3 text-white/70">
                      {d.answered > 0 ? `${d.averageScore ?? "?"} out of 5 (${d.answered})` : "Not yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

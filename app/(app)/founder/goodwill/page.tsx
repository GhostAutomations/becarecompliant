import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import GoodwillGrantForm from "@/components/founder/goodwill-grant-form";
import { stopGoodwillGrant } from "@/lib/founder/goodwill-actions";
import { londonTodayIso } from "@/lib/holidays/changes";
import {
  GOODWILL_FREQUENCIES,
  GOODWILL_REASONS,
  goodwillDates,
  goodwillNextDate,
  longDate,
  type GoodwillFrequency,
  type GoodwillReason,
} from "@/lib/billing/goodwill-schedule";

/**
 * FOUNDER > GOODWILL CREDITS (0472, Phil 2026-10-14; docs/decisions/goodwill-credits.md). Extra SMS
 * and AI credits for a company, once, weekly or monthly. They never expire. The company sees a
 * labelled line on its Billing page; the reason and the private note stay here.
 */
export const metadata: Metadata = { title: "Goodwill credits" };

type GrantRow = {
  id: string;
  company_id: string;
  sms_amount: number;
  ai_amount: number;
  frequency: GoodwillFrequency;
  start_date: string;
  times: number | null;
  end_date: string | null;
  reason: GoodwillReason;
  private_note: string | null;
  status: "active" | "stopped" | "finished";
  created_at: string;
  stopped_at: string | null;
  finished_at: string | null;
};

function credits(sms: number, ai: number): string {
  return [sms > 0 ? `${sms.toLocaleString("en-GB")} SMS` : "", ai > 0 ? `${ai.toLocaleString("en-GB")} AI` : ""].filter(Boolean).join(" and ");
}

function londonDay(iso: string | null): string {
  if (!iso) return "";
  return longDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso)));
}

export default async function GoodwillPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: grantRows, error: grantErr }, { data: periodRows }, { data: companyRows }] = await Promise.all([
    supabase.from("goodwill_grants").select("*").order("created_at", { ascending: false }),
    supabase.from("goodwill_grant_periods").select("grant_id"),
    supabase.from("companies").select("id, name, is_test").is("deleted_at", null).order("name"),
  ]);
  const grants = (grantRows ?? []) as GrantRow[];
  const given = new Map<string, number>();
  for (const p of (periodRows ?? []) as Array<{ grant_id: string }>) given.set(p.grant_id, (given.get(p.grant_id) ?? 0) + 1);
  const companies = ((companyRows ?? []) as Array<{ id: string; name: string; is_test: boolean }>).map((c) => ({ id: c.id, name: c.name, isTest: c.is_test }));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const today = londonTodayIso();

  const active = grants.filter((g) => g.status === "active");
  const past = grants.filter((g) => g.status !== "active");

  const plan = (g: GrantRow) => ({ start: g.start_date, frequency: g.frequency, times: g.times, endDate: g.end_date });
  const howOften = (g: GrantRow) => {
    if (g.frequency === "once") return `One off, ${longDate(g.start_date)}`;
    const every = g.frequency === "weekly" ? "Weekly" : "Monthly";
    return g.times != null ? `${every}, ${g.times} ${g.times === 1 ? "time" : "times"}` : `${every}, until ${longDate(g.end_date ?? g.start_date)}`;
  };

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/founder" label="Back to Founder" />
      <div>
        <h1 className="page-title">Goodwill credits</h1>
        <p className="page-subtitle">
          Extra SMS and AI credits for a company, once, weekly or monthly. They are added to the
          balance like a top up and never expire. The company sees a line on its Billing page, such
          as &ldquo;+200 SMS credits, goodwill from Be Care Compliant&rdquo;. Your reason and note
          stay here.
        </p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">New grant</h2>
        <GoodwillGrantForm companies={companies} today={today} />
      </section>

      {grantErr ? (
        <div className="glass-card p-6 text-sm text-red-300">The grants could not be read: {grantErr.message}</div>
      ) : grants.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">No goodwill credits given yet.</div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-white/80">Running</h2>
            {active.length === 0 ? (
              <div className="glass-card p-5 text-sm text-white/60">Nothing running at the moment.</div>
            ) : (
              <div className="glass-card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white/50">
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Credits each time</th>
                      <th className="px-4 py-3 font-medium">How often</th>
                      <th className="px-4 py-3 font-medium">Next grant</th>
                      <th className="px-4 py-3 font-medium">Given so far</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((g) => {
                      const n = given.get(g.id) ?? 0;
                      const total = goodwillDates(plan(g)).length;
                      const next = goodwillNextDate(plan(g), n);
                      return (
                        <tr key={g.id} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3 font-medium text-white">{companyName.get(g.company_id) ?? "Deleted company"}</td>
                          <td className="px-4 py-3 text-white/80">{credits(g.sms_amount, g.ai_amount)}</td>
                          <td className="px-4 py-3 text-white/70">{howOften(g)}</td>
                          <td className="px-4 py-3 text-white/70">{next ? (next <= today ? "Today" : longDate(next)) : "None left"}</td>
                          <td className="px-4 py-3 text-white/70">{n} of {total}</td>
                          <td className="px-4 py-3 text-white/70">
                            {GOODWILL_REASONS[g.reason]}
                            {g.private_note ? <span className="block max-w-xs whitespace-pre-wrap text-xs text-white/40">{g.private_note}</span> : null}
                          </td>
                          <td className="px-4 py-3">
                            <ActionForm
                              action={stopGoodwillGrant}
                              hidden={{ grant_id: g.id }}
                              label="Stop"
                              savingLabel="Stopping…"
                              savedLabel="Stopped"
                              confirm={`Stop the goodwill credits for ${companyName.get(g.company_id) ?? "this company"}? The ${n} already given stay on their balance; no more will be added.`}
                              buttonClassName="btn-outline btn-xs"
                              className=""
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-white/80">History</h2>
            {past.length === 0 ? (
              <div className="glass-card p-5 text-sm text-white/60">No finished or stopped grants yet.</div>
            ) : (
              <div className="glass-card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white/50">
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Credits each time</th>
                      <th className="px-4 py-3 font-medium">How often</th>
                      <th className="px-4 py-3 font-medium">Given</th>
                      <th className="px-4 py-3 font-medium">Ended</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((g) => (
                      <tr key={g.id} className="border-t border-white/10 align-top">
                        <td className="px-4 py-3 font-medium text-white">{companyName.get(g.company_id) ?? "Deleted company"}</td>
                        <td className="px-4 py-3 text-white/80">{credits(g.sms_amount, g.ai_amount)}</td>
                        <td className="px-4 py-3 text-white/70">{g.frequency === "once" ? GOODWILL_FREQUENCIES.once : howOften(g)}</td>
                        <td className="px-4 py-3 text-white/70">{given.get(g.id) ?? 0} {(given.get(g.id) ?? 0) === 1 ? "time" : "times"}</td>
                        <td className="px-4 py-3 text-white/70">
                          {g.status === "stopped" ? (
                            <>
                              <span className="pill-amber">Stopped</span>
                              <span className="ml-2">{londonDay(g.stopped_at)}</span>
                            </>
                          ) : (
                            <>
                              <span className="pill-green">Finished</span>
                              <span className="ml-2">{londonDay(g.finished_at)}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {GOODWILL_REASONS[g.reason]}
                          {g.private_note ? <span className="block max-w-xs whitespace-pre-wrap text-xs text-white/40">{g.private_note}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

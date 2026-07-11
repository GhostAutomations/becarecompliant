import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Usage" };

type UsageRow = {
  kind: "sms" | "ai";
  month: string;
  event_count: number;
  units_sum: number;
};

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function UsagePage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const { data } = await supabase
    .from("usage_monthly")
    .select("kind, month, event_count, units_sum")
    .eq("company_id", profile.company_id)
    .order("month", { ascending: false })
    .limit(24);

  const rows = (data ?? []) as UsageRow[];
  const currentMonth = rows[0]?.month ?? null;
  const thisMonth = currentMonth ? rows.filter((r) => r.month === currentMonth) : [];
  const sms = thisMonth.find((r) => r.kind === "sms");
  const ai = thisMonth.find((r) => r.kind === "ai");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Usage</h1>
        <p className="page-subtitle">
          Metered SMS and AI usage for your company, by calendar month.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">SMS this month</h2>
          <p className="mt-2 text-3xl font-bold text-white">
            {sms ? Number(sms.units_sum) : 0}
            <span className="text-base font-medium text-white/50"> segments</span>
          </p>
          <p className="text-xs text-white/50">
            {sms ? `${sms.event_count} ${sms.event_count === 1 ? "message" : "messages"} sent` : "No messages sent yet"}
          </p>
        </div>
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white/80">AI this month</h2>
          <p className="mt-2 text-3xl font-bold text-white">
            {ai ? Number(ai.units_sum).toLocaleString("en-GB") : 0}
            <span className="text-base font-medium text-white/50"> tokens</span>
          </p>
          <p className="text-xs text-white/50">
            {ai ? `${ai.event_count} ${ai.event_count === 1 ? "call" : "calls"} made` : "No AI calls yet"}
          </p>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">History</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">
            Nothing metered yet. SMS escalations and AI features appear here from
            their first use.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white/50">
                <th className="py-1.5 font-medium">Month</th>
                <th className="py-1.5 font-medium">Type</th>
                <th className="py-1.5 font-medium">Events</th>
                <th className="py-1.5 font-medium">Units</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.month}-${r.kind}`} className="border-t border-white/10 text-white/80">
                  <td className="py-1.5">{monthLabel(r.month)}</td>
                  <td className="py-1.5">{r.kind === "sms" ? "SMS" : "AI"}</td>
                  <td className="py-1.5">{r.event_count}</td>
                  <td className="py-1.5">
                    {Number(r.units_sum).toLocaleString("en-GB")}{" "}
                    {r.kind === "sms" ? "segments" : "tokens"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

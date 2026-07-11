import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Usage" };

type UsageRow = {
  company_id: string;
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

export default async function FounderUsagePage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: usage }, { data: companies }] = await Promise.all([
    supabase
      .from("usage_monthly")
      .select("company_id, kind, month, event_count, units_sum")
      .order("month", { ascending: false })
      .limit(200),
    supabase.from("companies").select("id, name, tier"),
  ]);

  const rows = (usage ?? []) as UsageRow[];
  const companyById = new Map((companies ?? []).map((c) => [c.id, c]));
  const months = [...new Set(rows.map((r) => r.month))];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Usage</h1>
        <p className="page-subtitle">
          Metered SMS and AI usage per company. Diamond tier billing reads from
          these numbers.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            Nothing metered yet. SMS escalations and AI features appear here from
            their first use.
          </p>
        </div>
      ) : (
        months.map((month) => (
          <section key={month} className="glass-card p-5">
            <h2 className="text-sm font-semibold text-white/80">{monthLabel(month)}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/50">
                  <th className="py-1.5 font-medium">Company</th>
                  <th className="py-1.5 font-medium">Tier</th>
                  <th className="py-1.5 font-medium">Type</th>
                  <th className="py-1.5 font-medium">Events</th>
                  <th className="py-1.5 font-medium">Units</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.month === month)
                  .map((r) => {
                    const company = companyById.get(r.company_id);
                    return (
                      <tr
                        key={`${r.company_id}-${r.kind}`}
                        className="border-t border-white/10 text-white/80"
                      >
                        <td className="py-1.5">{company?.name ?? "Unknown"}</td>
                        <td className="py-1.5 capitalize">{company?.tier ?? ""}</td>
                        <td className="py-1.5">{r.kind === "sms" ? "SMS" : "AI"}</td>
                        <td className="py-1.5">{r.event_count}</td>
                        <td className="py-1.5">
                          {Number(r.units_sum).toLocaleString("en-GB")}{" "}
                          {r.kind === "sms" ? "segments" : "tokens"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

import Link from "next/link";
import { PRICING_TIERS, PRICING_FOOTNOTE } from "@/lib/marketing/tiers";

/** Side by side pricing comparison: Business vs Pro, feature rows with gold ticks,
 *  red crosses, or the included value. Prices come from lib/marketing/tiers.ts. */

type Val = "yes" | "no" | string;
type Row = { label: string; business: Val; pro: Val };

const ROWS: Row[] = [
  { label: "People and Service User registers", business: "yes", pro: "yes" },
  { label: "Recurring checks with red, amber, green status", business: "yes", pro: "yes" },
  { label: "Holiday and absence tracking", business: "yes", pro: "yes" },
  { label: "Training records", business: "yes", pro: "yes" },
  { label: "Company dashboard", business: "yes", pro: "yes" },
  { label: "Role based access", business: "yes", pro: "yes" },
  { label: "Bulk import, take on a service", business: "yes", pro: "yes" },
  { label: "Built in forms stored as inspection evidence", business: "yes", pro: "yes" },
  { label: "Email reminders and the daily digest", business: "yes", pro: "yes" },
  { label: "Basic reporting: the compliance register", business: "yes", pro: "yes" },
  { label: "Complaints management", business: "no", pro: "yes" },
  { label: "All reports: PQS return, evidence packs, audit trail, training", business: "no", pro: "yes" },
  { label: "SMS reminders", business: "no", pro: "yes" },
  { label: "Form builder", business: "no", pro: "yes" },
  { label: "Priority support", business: "no", pro: "yes" },
  { label: "AI credits included each month", business: "25", pro: "50" },
  { label: "Branches included", business: "1", pro: "2" },
  { label: "Users included", business: "4", pro: "6" },
];

function Mark({ v }: { v: Val }) {
  if (v === "yes") return <span className="text-xl font-bold text-gold-400" aria-label="Included">&#10003;</span>;
  if (v === "no") return <span className="text-lg font-bold text-red-400" aria-label="Not included">&#10005;</span>;
  return <span className="font-semibold text-white">{v}</span>;
}

export default function PricingTable() {
  const [biz, pro] = PRICING_TIERS;
  return (
    <div>
      <div className="glass-card overflow-x-auto p-2 sm:p-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-3 py-4 text-left align-bottom" />
              <th className="px-3 py-4 text-center align-bottom">
                <div className="text-base font-bold text-white">{biz.name}</div>
                <div className="mt-1 text-2xl font-bold text-white">{biz.price}</div>
                <div className="text-xs text-white/55">{biz.cadence}</div>
              </th>
              <th className="rounded-t-xl bg-gold-400/[0.06] px-3 py-4 text-center align-bottom">
                <div className="text-base font-bold text-gold-400">{pro.name}</div>
                <div className="mt-1 text-2xl font-bold text-white">{pro.price}</div>
                <div className="text-xs text-white/55">{pro.cadence}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-white/10">
                <td className="px-3 py-3 text-left text-white/80">{r.label}</td>
                <td className="px-3 py-3 text-center">
                  <Mark v={r.business} />
                </td>
                <td className="bg-gold-400/[0.06] px-3 py-3 text-center">
                  <Mark v={r.pro} />
                </td>
              </tr>
            ))}
            <tr className="border-t border-white/10">
              <td className="px-3 py-4" />
              <td className="px-3 py-4 text-center">
                <Link href={`/start-trial?tier=${biz.key}`} className="btn-outline text-sm">Start free trial</Link>
              </td>
              <td className="rounded-b-xl bg-gold-400/[0.06] px-3 py-4 text-center">
                <Link href={`/start-trial?tier=${pro.key}`} className="btn-primary text-sm">Start free trial</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-center text-xs text-white/50">{PRICING_FOOTNOTE}</p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRotaOffice } from "@/lib/rota/access";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import MarEditor from "@/components/rota/mar-editor";
import { dueGrid, getMar } from "@/lib/rota/mar-data";
import { OUTCOME_CODES, OUTCOME_LABELS, doseReasonLabel, nhsNumberShown, slotWords } from "@/lib/rota/mar";
import { dayLabel } from "@/lib/rota/types";

export const metadata: Metadata = { title: "MAR" };

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ukDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function londonHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/**
 * A service user's MAR (Rota and Visits Stage 6, Phil 2026-10-17; docs/decisions/rota-visits.md,
 * Stage 6): what NICE NG67 1.5.5 asks a MAR to show, the medicines and their second checks, stock,
 * the last 7 days of doses with any not recorded in red, and the monthly MAR chart to print. For
 * the rota office of the branch (RLS); viewing is audit logged. Bevan test data only (beta banner).
 */
export default async function MarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile, companyId } = await requireRotaOffice();
  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, full_name, date_of_birth, nhs_number, gp_practice, allergies, company_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; full_name: string; date_of_birth: string | null; nhs_number: string | null; gp_practice: string | null; allergies: string | null }>();
  if (!su) notFound();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const from = addDays(today, -6);
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.mar_viewed",
    entityType: "service_user",
    entityId: id,
    summary: `Viewed the MAR of ${su.full_name}`,
  });
  const data = await getMar(id, from, today);
  const grid = dueGrid(data).sort((a, b) => b.visit.startsAt.localeCompare(a.visit.startsAt));
  const prnDoses = data.doses.filter((d) => data.meds.find((m) => m.medUid === d.medUid)?.prn).reverse();
  const medName = new Map(data.meds.map((m) => [m.medUid, m.name]));
  const nowMs = Date.now();
  const month = today.slice(0, 7);

  return (
    <div className="page-shell space-y-5">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      {/* Live (Phil, 2026-10-17: a checker waiting with the page open sees each medicine arrive):
          the MAR tables broadcast a change (0501), and the page pushes it in without a reload. */}
      <RealtimeRefresh tables={["rota_mar_medicines", "rota_mar_stock", "rota_mar_doses"]} channel="mar-live" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">MAR</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">{su.full_name}: medicines administration record.</p>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
        Beta, test data only. Before any real service user uses this MAR, the Clinical Safety Officer review and the Welsh record keeping research must be done.
      </div>

      <section className="glass-card grid gap-3 p-4 sm:grid-cols-2" aria-label="Details">
        <div>
          <p className="text-xs text-white/50">Known allergies</p>
          {su.allergies ? (
            <p className="text-sm font-semibold text-red-300">{su.allergies}</p>
          ) : (
            <p className="text-sm text-amber-300">Not recorded. Ask, and record it in Manage record (write None known if there are none).</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-white/50">Date of birth</p>
            <p className="text-white/85">{su.date_of_birth ? ukDate(su.date_of_birth) : "Not recorded"}</p>
          </div>
          <div>
            <p className="text-xs text-white/50">NHS number</p>
            <p className="text-white/85">{su.nhs_number ? nhsNumberShown(su.nhs_number) : "Not recorded"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-white/50">GP practice</p>
            <p className="text-white/85">{su.gp_practice ?? "Not recorded"}</p>
          </div>
        </div>
        <p className="text-xs text-white/45 sm:col-span-2">
          These come from the service user&apos;s record.{" "}
          <Link href={`/service-users/${id}`} className="underline">
            Change them in Manage record
          </Link>
          .
        </p>
      </section>

      <section className="glass-card flex flex-wrap items-center justify-between gap-2 p-4 text-xs text-white/60" aria-label="The NHS list">
        <span>
          {data.release
            ? `Medicines come from the NHS list (dm+d), release ${data.release.release}, loaded ${ukDate(data.release.loadedAt)}; it updates every Monday.`
            : "The NHS medicines list (dm+d) has not been loaded yet, so medicines cannot be added. Ask Be Care Compliant support."}
        </span>
      </section>

      <MarEditor serviceUserId={id} meds={data.meds} balances={data.balances} myProfileId={user.id} dmdReady={data.dmdCount > 0} />

      <section className="glass-card space-y-3 p-4" aria-label="The last 7 days">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">The last 7 days</h2>
          <a href={`/api/rota/mar-chart/${id}?month=${month}`} className="btn-outline px-3 py-1.5 text-xs">
            Print the MAR chart (PDF)
          </a>
        </div>
        {grid.length === 0 ? (
          <p className="text-sm text-white/55">No regular doses were due at a visit in the last 7 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-white/50">
                  <th className="py-1 pr-3">Visit</th>
                  <th className="py-1 pr-3">Medicine</th>
                  <th className="py-1 pr-3">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {grid.map(({ visit, med, dose }) => {
                  const overdue = !dose && (visit.clockedOut || nowMs > Date.parse(visit.startsAt) + 3 * 3600_000);
                  return (
                    <tr key={`${visit.id}-${med.medUid}`} className="border-t border-white/5">
                      <td className="py-1 pr-3 text-white/70">
                        {dayLabel(visit.date)} {visit.startTime} · {slotWords([visit.slot]) || "call"}
                      </td>
                      <td className="py-1 pr-3 text-white/85">
                        {med.name}
                        {med.timeSensitive ? <span className="ml-1 text-red-300">(time sensitive)</span> : null}
                      </td>
                      <td className={`py-1 pr-3 ${dose ? (dose.outcome === "given" ? "text-emerald-300" : "text-amber-300") : overdue ? "font-semibold text-red-300" : "text-white/45"}`}>
                        {dose
                          ? `${OUTCOME_CODES[dose.outcome]} ${OUTCOME_LABELS[dose.outcome]}${dose.reasonCode ? `: ${doseReasonLabel(dose.reasonCode, dose.reasonText)}` : ""} · ${londonHhmm(dose.at)}, ${dose.author}`
                          : overdue
                            ? "Not recorded"
                            : "Not yet"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {prnDoses.length ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white/70">When required doses</p>
            <ul className="space-y-0.5 text-xs text-white/75">
              {prnDoses.map((d) => (
                <li key={d.id}>
                  {dayLabel(d.at.slice(0, 10))} {londonHhmm(d.at)}: {medName.get(d.medUid)} · {OUTCOME_LABELS[d.outcome]}
                  {d.quantity ? `, ${d.quantity}` : ""}
                  {d.reasonCode ? `: ${doseReasonLabel(d.reasonCode, d.reasonText)}` : ""} · {d.author}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

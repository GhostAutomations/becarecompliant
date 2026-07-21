import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CarePlanManager from "@/components/service-users/care-plan-manager";
import CarePlanUpload from "@/components/service-users/care-plan-upload";
import { getServiceUser, getCarePlanEntries, getCarePlanVersions } from "@/lib/service-users/data";
import { getInvoicingConfig, londonToday } from "@/lib/invoicing/data";
import { INVOICE_SERVICES, serviceFixedPence } from "@/lib/invoicing/types";
import { CARE_PLAN_DAYS } from "@/lib/service-users/care-plan-consts";

export const metadata: Metadata = { title: "Care plan" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

function fmtDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function CarePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);
  const [entries, versions, config] = await Promise.all([
    getCarePlanEntries(id),
    getCarePlanVersions(id),
    getInvoicingConfig(su.company_id),
  ]);
  const servicesWithFixed = INVOICE_SERVICES.filter((s) => serviceFixedPence(config, s.key) > 0).map((s) => s.label);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />
      <div>
        <h1 className="page-title">Care plan</h1>
        <p className="page-subtitle">{su.full_name}</p>
      </div>

      <CarePlanManager
        serviceUserId={id}
        initial={entries}
        servicesWithFixed={servicesWithFixed}
        today={londonToday()}
        hasPlan={entries.length > 0}
      />

      {versions.map((v) => (
        <details key={`${v.effective_from}-${v.effective_to}`} className="glass-card p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/80">
              Care Plan: {fmtDate(v.effective_from)} - {fmtDate(v.effective_to)}
            </span>
            <span className="text-xs text-white/45">Show</span>
          </summary>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {v.entries.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="py-1 pr-3 text-white/70">{CARE_PLAN_DAYS[e.day_of_week]}</td>
                  <td className="py-1 pr-3 text-white/85">{e.service}</td>
                  <td className="py-1 pr-3 text-white/70">{e.unit}</td>
                  <td className="py-1 pr-3 text-white/70">{e.handed === "double" ? "Double" : "Single"}</td>
                  <td className="py-1 text-right text-white/70">{e.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}

      <CarePlanUpload serviceUserId={id} uploadedAt={su.care_plan_uploaded_at ?? null} editable />
    </div>
  );
}

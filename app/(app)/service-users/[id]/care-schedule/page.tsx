import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CareScheduleEditor from "@/components/service-users/care-schedule-editor";
import { getServiceUser, getCarePlanEntries, getCurrentCarePlanFrom } from "@/lib/service-users/data";
import { getInvoicingConfig, londonToday } from "@/lib/invoicing/data";
import { INVOICE_SERVICES, serviceFixedPence } from "@/lib/invoicing/types";

export const metadata: Metadata = { title: "Care schedule" };

const MANAGE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

/**
 * THE SCHEDULE, EDITABLE, ON ITS OWN (Phil, 2026-09-09: "i dont want to see anything to do
 * with the care plan and the page is now super wide and looks bad").
 *
 * The care plan page also carries the uploaded document, a summary of the week and the version
 * history. None of that is what somebody pressing Edit care schedule came for, and all of it
 * made the page wide enough to read badly.
 *
 * `page-form` rather than the full width shell: this is a form, and a form reads better in a
 * column than stretched across a monitor.
 */
export default async function CareSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);

  const [entries, currentFrom, config] = await Promise.all([
    getCarePlanEntries(id),
    getCurrentCarePlanFrom(id),
    getInvoicingConfig(su.company_id),
  ]);
  const servicesWithFixed = INVOICE_SERVICES.filter(
    (s) => serviceFixedPence(config, s.key) > 0,
  ).map((s) => s.label);

  return (
    <div className="page-shell page-form space-y-6">
      <BackLink href={`/service-users/${id}`} label="Back to record" />

      <div>
        <h1 className="page-title">Care schedule</h1>
        <p className="page-subtitle">
          {su.full_name} · every call this package runs. Invoices are built from this.
        </p>
      </div>

      <CareScheduleEditor
        serviceUserId={id}
        initial={entries}
        servicesWithFixed={servicesWithFixed}
        today={londonToday()}
        hasPlan={entries.length > 0}
        currentFrom={currentFrom}
        backHref={`/service-users/${id}`}
      />
    </div>
  );
}

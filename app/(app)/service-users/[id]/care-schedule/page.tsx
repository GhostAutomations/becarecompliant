import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
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
 * A COLUMN, not the full width shell: this is a form, and a form reads better in a column than
 * stretched across a monitor. The wide column rather than the narrow one, because a care
 * package line is five controls and a Remove on one row and it wrapped at the narrow width.
 */
export default async function CareSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);
  /* GDPR, special category data (audit S7, 4 Oct 2026): a read of a Service User's own pages is
     audited like the record itself (service_user.viewed). Best effort; never blocks the page. */
  await writeAudit({
    companyId: su.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "service_user.care_schedule_viewed",
    entityType: "service_user",
    entityId: id,
    summary: `Viewed the care schedule of ${su.full_name}`,
  });

  const [entries, currentFrom, config] = await Promise.all([
    getCarePlanEntries(id),
    getCurrentCarePlanFrom(id),
    getInvoicingConfig(su.company_id),
  ]);
  const servicesWithFixed = INVOICE_SERVICES.filter(
    (s) => serviceFixedPence(config, s.key) > 0,
  ).map((s) => s.label);

  return (
    <div className="page-shell page-form-wide space-y-6">
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

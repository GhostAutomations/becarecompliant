import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listFounderAudit } from "@/lib/audit-log/data";
import BackLink from "@/components/back-link";
import AuditLogView from "@/components/reports/audit-log-view";

export const metadata: Metadata = { title: "Audit console" };

export default async function FounderAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();

  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v : null);
  const filters = {
    actor: str(sp.actor),
    entity: str(sp.entity),
    from: str(sp.from),
    to: str(sp.to),
    company: str(sp.company),
  };

  // AuditLogView uses the `entity`/`company` query keys for its form fields;
  // the data layer takes `entityType`/`companyId`. Map across so the founder
  // company + entity filters actually apply.
  const entries = await listFounderAudit({
    actor: filters.actor,
    entityType: filters.entity,
    from: filters.from,
    to: filters.to,
    companyId: filters.company,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href="/founder" label="Back to founder console" />
      <div>
        <h1 className="page-title">Audit console</h1>
        <p className="page-subtitle">
          Every change across every company. Read only, filterable and exportable.
        </p>
      </div>
      <AuditLogView
        entries={entries}
        filters={filters}
        formAction="/founder/audit"
        exportBase="/api/reports/audit?scope=founder"
        scope="founder"
        entitled={true}
      />
    </div>
  );
}

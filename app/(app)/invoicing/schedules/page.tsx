import type { Metadata } from "next";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { listSchedules } from "@/lib/invoicing/data";
import { cancelSchedule } from "@/lib/invoicing/invoice-actions";
import ActionForm from "@/components/action-form";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Recurring invoices" };

export default async function SchedulesPage() {
  const { companyId } = await requireInvoicing();
  const schedules = await listSchedules(companyId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/invoicing" label="Back to Invoicing" />
      <div>
        <h1 className="page-title">Recurring invoices</h1>
        <p className="page-subtitle">
          Invoices that draft automatically. Set one up by ticking Repeat when creating an invoice.
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">No recurring invoices yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((sc) => (
            <div key={sc.id} className="glass-card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{sc.client_name}</p>
                <p className="text-xs text-white/50">
                  Every {sc.interval_count > 1 ? `${sc.interval_count} ` : ""}
                  {sc.frequency === "weekly" ? "week" : "month"}
                  {sc.interval_count > 1 ? "s" : ""} · next drafts {sc.next_run_date}
                </p>
              </div>
              <ActionForm
                action={cancelSchedule}
                hidden={{ schedule_id: sc.id }}
                label="Cancel"
                buttonClassName="btn-ghost text-xs"
                confirm="Cancel this recurring invoice? No more will draft automatically."
                className=""
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

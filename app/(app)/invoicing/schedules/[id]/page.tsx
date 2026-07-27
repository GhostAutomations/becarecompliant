import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInvoicing } from "@/lib/invoicing/guard";
import { getSchedule, londonToday } from "@/lib/invoicing/data";
import { updateSchedule, draftScheduleNow, cancelSchedule } from "@/lib/invoicing/invoice-actions";
import { formatMoney, billingPeriodFor, displayStatus, STATUS_PILL, STATUS_LABEL } from "@/lib/invoicing/types";
import { CARE_PLAN_DAYS } from "@/lib/service-users/care-plan-consts";
import ActionForm from "@/components/action-form";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Recurring invoice" };

function fmtDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { companyId } = await requireInvoicing();
  const sc = await getSchedule(companyId, id);
  if (!sc) redirect("/invoicing/schedules");

  const today = londonToday();
  // What the NEXT automatic run will bill, and what a Draft it now would bill.
  const nextPeriod = billingPeriodFor(sc.next_run_date, sc.frequency, sc.interval_count);
  const nowPeriod = billingPeriodFor(today, sc.frequency, sc.interval_count);
  const cadence = `Every ${sc.interval_count > 1 ? `${sc.interval_count} ` : ""}${
    sc.frequency === "weekly" ? "week" : "month"
  }${sc.interval_count > 1 ? "s" : ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/invoicing/schedules" label="Back to recurring invoices" />

      <div>
        <h1 className="page-title">{sc.client_name}</h1>
        <p className="page-subtitle">
          {cadence} · next drafts {fmtDate(sc.next_run_date)}
          {sc.active ? "" : " · cancelled"}
        </p>
      </div>

      <div className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white">What it bills</h2>
        <p className="text-sm text-white/70">
          Each run invoices the period that has just finished, so you bill for care that has
          actually been delivered. The next run on {fmtDate(sc.next_run_date)} will bill{" "}
          <span className="text-white">
            {fmtDate(nextPeriod.from)} to {fmtDate(nextPeriod.to)}
          </span>
          .
        </p>
        {sc.carePlanBilled ? (
          <p className="text-sm text-white/70">
            Lines are read from{" "}
            {sc.service_user_id ? (
              <Link href={`/service-users/${sc.service_user_id}/care-plan`} className="underline">
                the care plan
              </Link>
            ) : (
              "the care plan"
            )}{" "}
            each time it runs ({sc.carePlanRows} row{sc.carePlanRows === 1 ? "" : "s"} on the current
            version), so a change to the care plan is billed correctly rather than repeating what was
            set up on day one. Weeks are shown separately on the invoice, and a plan change part way
            through a week splits that week at the change date.
          </p>
        ) : (
          <p className="text-sm text-white/70">
            This one repeats a fixed set of lines. It does not read the care plan, because the
            invoice it was created from was not built from one.
          </p>
        )}
      </div>

      <div className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-white">Schedule</h2>
        <ActionForm action={updateSchedule} hidden={{ schedule_id: sc.id }} label="Save">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="form-label">Repeats</span>
              <select name="frequency" defaultValue={sc.frequency}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="block">
              <span className="form-label">Every</span>
              <input
                type="number"
                name="interval_count"
                min={1}
                max={52}
                defaultValue={sc.interval_count}
              />
            </label>
            <label className="block">
              <span className="form-label">On a (weekly only)</span>
              <select name="day_of_week" defaultValue={sc.day_of_week ?? ""}>
                <option value="">No set day</option>
                {CARE_PLAN_DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="form-label">On the (monthly only)</span>
              <select name="day_of_month" defaultValue={sc.day_of_month ?? ""}>
                <option value="">No set day</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="form-label">Next runs on</span>
              <input
                type="date"
                name="next_run_date"
                defaultValue={sc.next_run_date}
              />
            </label>
          </div>
        </ActionForm>
      </div>

      <div className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white">Draft one now</h2>
        <p className="text-sm text-white/70">
          Creates a draft straight away for {fmtDate(nowPeriod.from)} to {fmtDate(nowPeriod.to)},
          using exactly the same working the automatic run uses. It leaves the next run date alone,
          so trying it never moves a client&rsquo;s billing date.
        </p>
        <ActionForm
          action={draftScheduleNow}
          hidden={{ schedule_id: sc.id }}
          label="Draft it now"
          savingLabel="Drafting…"
          savedLabel="Drafted"
          className=""
        />
      </div>

      {sc.lines.length > 0 ? (
        <div className="glass-card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-white">
            {sc.carePlanBilled ? "Lines it was set up from" : "Lines it repeats"}
          </h2>
          <div className="space-y-1">
            {sc.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-white/80">{l.description}</span>
                <span className="shrink-0 text-white/50">
                  {l.quantity} x {formatMoney(l.unit_price_pence)}
                </span>
              </div>
            ))}
          </div>
          {sc.carePlanBilled ? (
            <p className="text-xs text-white/40">
              Shown for reference only. Each run recalculates from the care plan.
            </p>
          ) : null}
        </div>
      ) : null}

      {sc.drafted.length > 0 ? (
        <div className="glass-card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-white">Invoices from this</h2>
          <div className="space-y-1">
            {sc.drafted.map((inv) => {
              const ds = displayStatus(inv.status, inv.due_date, today);
              return (
                <Link
                  key={inv.id}
                  href={`/invoicing/${inv.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <span className="text-white/80">{inv.number ?? "Draft"}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-white/50">{fmtDate(inv.issue_date)}</span>
                    <span className="text-white/80">{formatMoney(inv.total_pence)}</span>
                    <span className={STATUS_PILL[ds]}>{STATUS_LABEL[ds]}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-card p-5">
          <p className="text-sm text-white/60">Nothing has drafted from this yet.</p>
        </div>
      )}

      {sc.active ? (
        <div className="glass-card flex items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Cancel</h2>
            <p className="text-sm text-white/60">Stop this drafting automatically. Invoices already raised are kept.</p>
          </div>
          <ActionForm
            action={cancelSchedule}
            hidden={{ schedule_id: sc.id }}
            label="Cancel"
            savedLabel="Cancelled"
            buttonClassName="btn-ghost text-xs"
            confirm="Cancel this recurring invoice? No more will draft automatically."
            className=""
          />
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { getMyRecord } from "@/lib/staff/data";
import BackLink from "@/components/back-link";
import ClockApp from "@/components/rota/clock-app";

export const metadata: Metadata = { title: "Clock in" };

/**
 * Clock in and Clock out (Rota and Visits Stage 3, Phil 2026-10-16). Only when the company has the
 * module on (Not Found otherwise, as the Rota pages do). The page itself carries no visit or
 * service user details: the carer's day is fetched by the phone and kept there, so this page also
 * opens from the phone's own copy when there is no signal (docs/project/rota-offline-design.md).
 */
export default async function ClockPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id || !moduleOnInRow(await getCompanyRow(profile.company_id), "rota_visits")) notFound();
  const record = await getMyRecord();

  return (
    <div className="page-shell mx-auto max-w-xl space-y-5">
      <BackLink href="/my" label="My area" />
      <div className="space-y-1">
        <h1 className="page-title">Clock in</h1>
        <p className="text-sm text-white/60">
          Tap Clock in when you arrive and Clock out when you leave. Your position is read only at the tap. With no signal, it is saved on this phone and sent later.
        </p>
      </div>
      {record ? (
        <ClockApp ownerId={profile.id} />
      ) : (
        <div className="glass-card p-4 text-sm text-white/60">
          Your login is not linked to a staff record, so there is nothing to clock in to. <Link href="/my" className="underline">Back to My area</Link>
        </div>
      )}
    </div>
  );
}

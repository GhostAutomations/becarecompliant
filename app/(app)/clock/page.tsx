import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { getMyRecord } from "@/lib/staff/data";
import ClockApp from "@/components/rota/clock-app";
import MyRota from "@/components/rota/my-rota";

export const metadata: Metadata = { title: "Care" };

/**
 * Care: the carer's tab for delivering care (Phil, 2026-10-17: My area and Care, no crossover).
 * Clock in and Clock out at the top (Rota and Visits Stage 3, Phil 2026-10-16), then their visits
 * and shifts for the next four weeks and the open shifts to ask for. The address stays /clock, so
 * the QR codes and the phone's offline copy keep working. Only when the company has the
 * module on (Not Found otherwise, as the Rota pages do). The page itself carries no visit or
 * service user details: the carer's day is fetched by the phone and kept there, so this page also
 * opens from the phone's own copy when there is no signal (docs/project/rota-offline-design.md).
 */
export default async function ClockPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id || !moduleOnInRow(await getCompanyRow(profile.company_id), "rota_visits")) notFound();
  const record = await getMyRecord();

  return (
    <div className="page-shell mx-auto max-w-xl space-y-5" id="care-top">
      <div className="space-y-1">
        <h1 className="page-title">Care</h1>
        <p className="text-sm text-white/60">
          Tap Clock in when you arrive and Clock out when you leave. Your position is read only at the tap. With no signal, it is saved on this phone and sent later.
        </p>
      </div>
      {record ? (
        <>
          <ClockApp ownerId={profile.id} />
          <MyRota personId={record.id} onCare />
        </>
      ) : (
        <div className="glass-card p-4 text-sm text-white/60">
          Your login is not linked to a staff record, so there is nothing to clock in to. <Link href="/my" className="underline">Back to My area</Link>
        </div>
      )}
    </div>
  );
}

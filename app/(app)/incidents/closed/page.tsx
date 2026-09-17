import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import IncidentsRegister from "@/components/incidents/incidents-register";
import { listIncidents, listAccessibleBranchTypes } from "@/lib/incidents/data";
import { INCIDENTS_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";

export const metadata: Metadata = { title: "Incidents: Closed" };


export default async function ClosedIncidentsPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const [rows, branches] = await Promise.all([
    listIncidents(profile.company_id),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);

  return (
    <div className="page-shell">
      <RealtimeRefresh tables={["incidents"]} channel="incidents-live" />
      <IncidentsRegister
        rows={rows}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        canManage
        scope="closed"
      />
    </div>
  );
}

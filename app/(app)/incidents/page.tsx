import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import IncidentsRegister from "@/components/incidents/incidents-register";
import { listIncidents, listAccessibleBranchTypes } from "@/lib/incidents/data";

export const metadata: Metadata = { title: "Incidents" };

/** No feature gate: recording an incident is a legal duty on every tier, Business
 *  included (Phil, 2026-08-12). Incidents can hold special-category data, so the
 *  roles match Complaints — Admins and Managers, not Supervisors or Viewers. */
const MANAGE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

export default async function IncidentsPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const [rows, branches] = await Promise.all([
    listIncidents(profile.company_id),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <RealtimeRefresh tables={["incidents"]} channel="incidents-live" />
      <IncidentsRegister
        rows={rows}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        canManage
      />
    </div>
  );
}

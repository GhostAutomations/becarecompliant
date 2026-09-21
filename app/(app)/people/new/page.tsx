import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CreatePersonForm from "@/components/people/create-person-form";
import {
  listBranches,
  listSupervisoryUsers,
  getBranchStaffMap,
  listJobTitles,
  listPeopleCheckDefinitions,
  getColumnLabels,
  getSupervisionCycleMode,
} from "@/lib/people/data";
import { REGISTER_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";
import { HISTORY_FLAG, TRACKER_BOXES, historyBoxes } from "@/lib/people/history-boxes";

export const metadata: Metadata = { title: "Add person" };


export default async function NewPersonPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/people");

  const [branches, users, branchStaff, jobTitles, definitions, columnLabels, cycleMode] =
    await Promise.all([
      listBranches(profile.company_id, profile),
      listSupervisoryUsers(profile.company_id),
      getBranchStaffMap(profile.company_id),
      listJobTitles(profile.company_id),
      listPeopleCheckDefinitions(profile.company_id),
      getColumnLabels(profile.company_id),
      getSupervisionCycleMode(profile.company_id),
    ]);
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");

  /* THE HISTORY BOXES ARE THIS COMPANY'S OWN COLUMNS. Which ones exist comes from their active
     checks and their supervision cycle, and the names come from whatever they have renamed the
     matrix columns to, so the panel reads like the register they already look at every day. */
  const history = historyBoxes(definitions, columnLabels, cycleMode).map((b) => ({
    name: b.name,
    label: b.label,
  }));
  const trackers = TRACKER_BOXES.map((b) => ({
    name: b.name,
    label: columnLabels[b.column] || b.fallback,
    kind: b.kind,
    hint: b.hint,
  }));

  return (
    <div className="page-form space-y-6">
      <div>
        <BackLink href="/people" label="Back to People" />
        <h1 className="page-title mt-1">Add a person</h1>
        <p className="page-subtitle">
          Identity and employment. Their compliance checks are applied and scheduled
          automatically — and if they already work here, tick the box at the bottom to record
          what they have already done.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreatePersonForm
          branches={branchOptions}
          users={users}
          branchStaff={branchStaff}
          jobTitles={jobTitles}
          historyFlag={HISTORY_FLAG}
          trackerBoxes={trackers}
          historyBoxes={history}
        />
      </div>
    </div>
  );
}

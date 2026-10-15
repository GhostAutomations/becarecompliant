import type { Metadata } from "next";
import { getRegulator } from "@/lib/complaints/data";
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
  getCompanyFormsByKeys,
} from "@/lib/people/data";
import { readActingCompanyId } from "@/lib/founder/manage-as";
import { DBS_FORM_KEY, RTW_FORM_KEY } from "@/lib/people/add-person-docs";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { REGISTER_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";
import { HISTORY_FLAG, TRACKER_BOXES, historyBoxes } from "@/lib/people/history-boxes";
import { disabledModulesFor } from "@/lib/auth/module-access";
import { canUseModule } from "@/lib/auth/module-catalogue";

export const metadata: Metadata = { title: "Add person" };


export default async function NewPersonPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/people");

  /* The DBS and Right to Work forms (Phil, 2026-10-15) come in the SAME batch as everything else
     on this page, one read for both, so the page waits for nothing extra. */
  const [branches, users, branchStaff, jobTitles, definitions, columnLabels, cycleMode, docForms, acting] =
    await Promise.all([
      listBranches(profile.company_id, profile),
      listSupervisoryUsers(profile.company_id),
      getBranchStaffMap(profile.company_id),
      listJobTitles(profile.company_id),
      listPeopleCheckDefinitions(profile.company_id),
      getColumnLabels(profile.company_id),
      getSupervisionCycleMode(profile.company_id),
      getCompanyFormsByKeys(profile.company_id, [DBS_FORM_KEY, RTW_FORM_KEY]),
      profile.role === "platform_admin" ? readActingCompanyId() : Promise.resolve(null),
    ]);
  /* Evidence is never signed in support mode (DEF-006), so there the two sections are a note
     (Phil's popup, 2026-10-15). */
  const supportMode = profile.role === "platform_admin" && Boolean(acting);
  const schemaOf = (key: string): FormSchema | null => {
    const s = docForms[key]?.schema;
    return isFormSchema(s) ? (s as FormSchema) : null;
  };
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");

  /* THE HISTORY BOXES ARE THIS COMPANY'S OWN COLUMNS. Which ones exist comes from their active
     checks and their supervision cycle, and the names come from whatever they have renamed the
     matrix columns to, so the panel reads like the register they already look at every day. */
  const history = historyBoxes(definitions, columnLabels, cycleMode).map((b) => ({
    name: b.name,
    label: b.label,
  }));
  /* ONE PLACE EACH (Phil's popup, 2026-10-15): DBS and Right to Work have their own sections, so
     the panel no longer asks for them. It keeps the probation boxes. */
  const trackers = TRACKER_BOXES.filter(
    (b) => !["t_dbs_date", "t_enhanced_dbs_date", "t_rtw_expiry_date", "t_rtw_limits"].includes(b.name),
  ).map((b) => ({
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
          automatically. If they already work here, tick the box at the bottom to record
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
          dbsSchema={schemaOf(DBS_FORM_KEY)}
          rtwSchema={schemaOf(RTW_FORM_KEY)}
          supportMode={supportMode}
          showScw={(await getRegulator(profile.company_id)) !== "cqc"}
          /* Only offer the Settings link to somebody who can open Settings (Phil, 2026-10-07: a
             Recruiter followed it to "That area is switched off"). */
          canOpenSettings={canUseModule(
            "settings",
            profile.role,
            await disabledModulesFor(profile.company_id, profile.role, profile.company_role_id ?? null),
          )}
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches, getCompanyFormByKey } from "@/lib/people/data";
import { listActivePeople } from "@/lib/absence/data";
import { listHolidayRequests } from "@/lib/holidays/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import HolidayView from "@/components/holidays/holiday-view";
import { HOLIDAY_APPROVER_ROLES, isCompanyWideRole } from "@/lib/notifications/roles";

export const metadata: Metadata = { title: "Holiday" };

export default async function HolidayPage() {
  const { user, profile } = await requireCompany();
  if (profile.role === "on_call") redirect("/on-call");
  // Care workers manage their own holiday in /my; this is the branch management view
  // (approve requests, book for others, the branch calendar). A staff login reaching it
  // exposed the company branch list. Match the People register's staff guard.
  if (profile.role === "staff") redirect("/my");

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink href="/people" label="Back to People" />
        <h1 className="page-title mt-1">Holiday</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view holidays.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  // Branch Manager and above approve/decline; a Supervisor may book a holiday for a
  // person (it lands pending) but cannot approve.
  // HOLIDAY_APPROVER_ROLES is the list the approver email uses, so the people
  // told a request is waiting are the people offered a decision. The founder is
  // added here and nowhere else: he has no company, so he is never a recipient.
  const canApprove =
    HOLIDAY_APPROVER_ROLES.includes(profile.role) || profile.role === "platform_admin";
  // A Branch Manager's authority is their branch, so a request carrying no branch is
  // not theirs to decide and can_manage_holiday refuses it. listBranches already
  // returns exactly their branches, and every branch for a company wide role.
  const companyWideApprover = isCompanyWideRole(profile.role) || profile.role === "platform_admin";
  const canBookForPerson = canApprove || profile.role === "supervisor";
  const [branches, requests, people, requestForm] = await Promise.all([
    listBranches(companyId, profile),
    listHolidayRequests(companyId, null),
    canBookForPerson ? listActivePeople(companyId) : Promise.resolve([]),
    getCompanyFormByKey(companyId, "holiday_requests"),
  ]);

  const requestSchema: FormSchema | null =
    requestForm && isFormSchema(requestForm.schema) ? (requestForm.schema as FormSchema) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh tables={["holiday_requests"]} channel="holiday" />
      <BackLink href="/people" label="Back to People" />
      <HolidayView
        requests={requests}
        branches={branches}
        people={people}
        requestSchema={requestSchema}
        currentUserId={user.id}
        canApprove={canApprove}
        approvableBranchIds={companyWideApprover ? null : branches.map((b) => b.id)}
        canBookForPerson={canBookForPerson}
      />
    </div>
  );
}

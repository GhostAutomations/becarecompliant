import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches, getCompanyFormByKey } from "@/lib/people/data";
import { listActivePeople } from "@/lib/absence/data";
import { listHolidayRequests } from "@/lib/holidays/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import HolidayView from "@/components/holidays/holiday-view";

export const metadata: Metadata = { title: "Holiday" };

export default async function HolidayPage() {
  const { profile } = await requireCompany();

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
  const canApprove = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"].includes(
    profile.role,
  );
  const canBookForPerson = canApprove || profile.role === "supervisor";
  const [branches, requests, people, requestForm, responseForm] = await Promise.all([
    listBranches(companyId),
    listHolidayRequests(companyId, null),
    canBookForPerson ? listActivePeople(companyId) : Promise.resolve([]),
    getCompanyFormByKey(companyId, "holiday_requests"),
    getCompanyFormByKey(companyId, "holiday_response"),
  ]);

  const requestSchema: FormSchema | null =
    requestForm && isFormSchema(requestForm.schema) ? (requestForm.schema as FormSchema) : null;
  const responseSchema: FormSchema | null =
    responseForm && isFormSchema(responseForm.schema) ? (responseForm.schema as FormSchema) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh tables={["holiday_requests"]} channel="holiday" />
      <BackLink href="/people" label="Back to People" />
      <HolidayView
        requests={requests}
        branches={branches}
        people={people}
        requestSchema={requestSchema}
        responseSchema={responseSchema}
        canApprove={canApprove}
        canBookForPerson={canBookForPerson}
      />
    </div>
  );
}

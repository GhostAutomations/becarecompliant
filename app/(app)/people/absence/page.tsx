import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches, getCompanyFormByKey } from "@/lib/people/data";
import { listAbsenceRegister, listActivePeople, listAbsenceEvents, listOpenBookings } from "@/lib/absence/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import AbsenceView from "@/components/absence/absence-view";

export const metadata: Metadata = { title: "Absence" };

export default async function AbsencePage() {
  const { profile } = await requireCompany();

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink href="/people" label="Back to People" />
        <h1 className="page-title mt-1">Absence</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view its Absence register.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const [branches, { config, rows }, people, events, absenceForm, meetingForm, openBookings] =
    await Promise.all([
      listBranches(companyId),
      listAbsenceRegister(companyId, null),
      listActivePeople(companyId),
      listAbsenceEvents(companyId, null),
      getCompanyFormByKey(companyId, "absence_back_office"),
      getCompanyFormByKey(companyId, "absence_management_meeting"),
      listOpenBookings(companyId),
    ]);

  const absenceSchema: FormSchema | null =
    absenceForm && isFormSchema(absenceForm.schema) ? (absenceForm.schema as FormSchema) : null;
  const meetingSchema: FormSchema | null =
    meetingForm && isFormSchema(meetingForm.schema) ? (meetingForm.schema as FormSchema) : null;

  const canManage = ["company_admin", "manager", "platform_admin"].includes(profile.role);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh
        tables={["absence_events", "absence_meetings"]}
        channel="absence"
      />
      <BackLink href="/people" label="Back to People" />
      <AbsenceView
        method={config.method}
        rows={rows}
        branches={branches}
        people={people}
        events={events}
        absenceSchema={absenceSchema}
        meetingSchema={meetingSchema}
        openBookings={openBookings}
        canManage={canManage}
      />
    </div>
  );
}

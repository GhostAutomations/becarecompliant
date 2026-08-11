import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import { getCompanyFormByKey } from "@/lib/people/data";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { getMyRecord, getMyHolidays, getMySubmissions, getMyTraining } from "@/lib/staff/data";
import {
  listAssignmentsForPerson,
  getPublishedSchemas,
  getPolicyConfig,
} from "@/lib/assignments/data";
import { POLICY_ACK_FORM_KEY } from "@/lib/assignments/types";
import MyHolidays from "@/components/staff/my-holidays";
import AssignedToMe from "@/components/staff/assigned-to-me";
import MySection from "@/components/staff/my-section";

/**
 * A Team Member's own area, and the only page a staff login has.
 *
 * Phil's scope, 2026-07-26: their holidays (which they can change or withdraw
 * while pending), the forms they have submitted, and the forms and policies
 * assigned to them. Assignments are the next increment, so this page carries the
 * first two and says plainly that nothing is assigned yet.
 *
 * Anyone with a login can open it: a Manager seeing their own holidays here is
 * useful, not a leak. What a staff login CANNOT reach is everything else, which
 * the RLS policies enforce rather than this page.
 */

export const metadata: Metadata = { title: "My area" };

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default async function MyAreaPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");

  const [record, submissions, requestForm, ackForm, policyConfig] = await Promise.all([
    getMyRecord(),
    getMySubmissions(),
    getCompanyFormByKey(profile.company_id, "holiday_requests"),
    getCompanyFormByKey(profile.company_id, POLICY_ACK_FORM_KEY),
    getPolicyConfig(profile.company_id),
  ]);

  const holidays = record ? await getMyHolidays(record.id) : [];
  // Item 26: the person being chased about their training was the only one who could not
  // look it up. Read through their own RLS (0173) and scored with the register's own rule.
  const training = record ? await getMyTraining(record.id) : [];
  const assignments = record ? await listAssignmentsForPerson(record.id) : [];

  // Only the assigned FORMS need a schema to render; policies are a document plus
  // a tick, so they need nothing here.
  const formIds = [
    ...new Set(
      assignments
        .filter((a) => a.status === "assigned" && a.form_id)
        .map((a) => a.form_id as string),
    ),
  ];
  const published = await getPublishedSchemas(formIds);
  const schemas: Record<string, FormSchema> = {};
  for (const [formId, v] of Object.entries(published)) {
    if (isFormSchema(v.schema)) schemas[formId] = v.schema as FormSchema;
  }
  const requestSchema: FormSchema | null =
    requestForm && isFormSchema(requestForm.schema) ? (requestForm.schema as FormSchema) : null;
  const ackSchema: FormSchema | null =
    ackForm && isFormSchema(ackForm.schema) ? (ackForm.schema as FormSchema) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <RealtimeRefresh tables={["holiday_requests"]} channel="my-holidays" />

      <div>
        <h1 className="page-title">
          {record?.full_name ? `Hello, ${record.full_name.split(" ")[0]}` : "My area"}
        </h1>
        <p className="page-subtitle">
          Your holidays, your briefings to read and sign, and the forms you have sent in.
        </p>
      </div>

      {!record ? (
        <div className="glass-card p-5">
          <p className="text-sm text-white/70">
            Your login is not linked to your staff record yet, so your holidays cannot be
            shown. Please ask your manager to check the email address on your record.
          </p>
        </div>
      ) : (
        <>
          <section className="glass-card p-5">
            <p className="text-lg font-semibold text-white">{record.full_name}</p>
            <p className="text-sm text-white/60">
              {record.job_title ?? "Team Member"}
              {record.branch_name ? ` · ${record.branch_name}` : ""}
            </p>
          </section>

          <MyHolidays holidays={holidays} requestSchema={requestSchema} />
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          My briefings
        </h2>
        <AssignedToMe
          assignments={assignments}
          schemas={schemas}
          ackSchema={ackSchema}
          policyConfig={policyConfig}
        />
      </section>

      {/* COLLAPSIBLE, like "Policies I have signed" (Phil, 2026-08-11): thirty four rows on a
          phone pushed everything else off the screen. Same MySection fold, so the three
          history style sections look and behave alike.

          THE WORDING IS KEYED ON cell.status, NOT ON THE COLOUR, and that distinction was
          found by actually logging in as a carer. Acme seeds 33 mandatory courses, Charlotte
          had one recorded, and the first version read "MY TRAINING (33 NEEDS ATTENTION)" with
          thirty three red "Out of date" rows. Every one was a course NOBODY HAD EVER RECORDED
          against her, which is not the same as one she let lapse, and telling a carer
          otherwise on their own screen is both wrong and demoralising. The manager's register
          is right to show a gap as red, because there it is the manager's gap; here it is a
          statement about her.

          Recorded courses sort first: that is her actual training history, not empty rows. */}
      {training.length > 0 ? (
        <MySection title="My training" count={training.length}>
          <p className="text-xs text-white/45">
            {(() => {
              const recorded = training.filter((t) => t.cell.status !== "missing");
              const lapsed = recorded.filter((t) => t.cell.rag === "red").length;
              const soon = recorded.filter((t) => t.cell.rag === "amber").length;
              const missing = training.length - recorded.length;
              const bits: string[] = [];
              if (recorded.length > 0) bits.push(`${recorded.length - lapsed - soon} in date`);
              if (soon > 0) bits.push(`${soon} due soon`);
              if (lapsed > 0) bits.push(`${lapsed} out of date`);
              if (missing > 0) bits.push(`${missing} not recorded yet`);
              return bits.join(" · ");
            })()}
          </p>
          <div className="glass-card divide-y divide-white/10">
            {[...training]
              .sort((a, b) => {
                const aMissing = a.cell.status === "missing";
                const bMissing = b.cell.status === "missing";
                if (aMissing !== bMissing) return aMissing ? 1 : -1;
                if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
                return a.courseName.localeCompare(b.courseName);
              })
              .map((t) => {
                const missing = t.cell.status === "missing";
                return (
                  <div key={t.courseId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className={`text-sm font-semibold ${missing ? "text-white/70" : "text-white"}`}>
                        {t.courseName}
                        {t.mandatory ? <span className="ml-2 text-xs text-white/40">Mandatory</span> : null}
                      </p>
                      {missing ? null : (
                        <p className="text-xs text-white/45">
                          {t.cell.label}
                          {t.cell.sub ? ` · ${t.cell.sub}` : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className={
                        missing
                          ? "pill-neutral"
                          : t.cell.rag === "red"
                            ? "pill-red"
                            : t.cell.rag === "amber"
                              ? "pill-amber"
                              : "pill-green"
                      }
                    >
                      {missing ? null : <span className="pill-dot" />}
                      {missing
                        ? "Not recorded"
                        : t.cell.rag === "red"
                          ? "Out of date"
                          : t.cell.rag === "amber"
                            ? "Due soon"
                            : "In date"}
                    </span>
                  </div>
                );
              })}
          </div>
          <p className="text-xs text-white/40">
            Your manager records training. Anything showing as not recorded has not been logged
            against you yet, so if you have done it, tell them.
          </p>
        </MySection>
      ) : null}

      <MySection title="Forms I have sent in" count={submissions.length}>
        {submissions.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">
            You have not sent in any forms yet.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {[...submissions]
              .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
              .map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">{s.form_name}</p>
                  <p className="text-xs text-white/45">Sent {formatWhen(s.submitted_at)}</p>
                </div>
                <Link href={`/evidence/${s.id}?from=my`} className="btn-outline px-3 py-2 text-xs">
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </MySection>
    </div>
  );
}

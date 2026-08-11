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

      {/* OPEN, not folded, and above the history sections. Everything else in here is
          either something they still have to do or a record of what they have done; their
          training is the one thing that quietly goes out of date while they do nothing, so
          it is the one thing worth putting in front of them. Mandatory courses first: those
          are the ones a manager will chase and an inspector will count. */}
      {training.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            My training ({training.filter((t) => t.cell.rag === "red").length > 0
              ? `${training.filter((t) => t.cell.rag === "red").length} needs attention`
              : "all in date"})
          </h2>
          <div className="glass-card divide-y divide-white/10">
            {[...training]
              .sort((a, b) =>
                a.mandatory === b.mandatory
                  ? a.courseName.localeCompare(b.courseName)
                  : a.mandatory
                    ? -1
                    : 1,
              )
              .map((t) => (
                <div key={t.courseId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {t.courseName}
                      {t.mandatory ? <span className="ml-2 text-xs text-white/40">Mandatory</span> : null}
                    </p>
                    <p className="text-xs text-white/45">
                      {t.cell.label}
                      {t.cell.sub ? ` · ${t.cell.sub}` : ""}
                    </p>
                  </div>
                  <span
                    className={
                      t.cell.rag === "red"
                        ? "pill-red"
                        : t.cell.rag === "amber"
                          ? "pill-amber"
                          : t.cell.rag === "green"
                            ? "pill-green"
                            : "pill-neutral"
                    }
                  >
                    {t.cell.rag === "none" ? null : <span className="pill-dot" />}
                    {t.cell.rag === "red"
                      ? "Out of date"
                      : t.cell.rag === "amber"
                        ? "Due soon"
                        : t.cell.rag === "green"
                          ? "In date"
                          : "Not recorded"}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-xs text-white/40">
            Training is recorded by your manager. If something here looks wrong, tell them.
          </p>
        </section>
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

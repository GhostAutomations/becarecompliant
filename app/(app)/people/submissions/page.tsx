import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import RealtimeRefresh from "@/components/realtime-refresh";
import { publicFormDef } from "@/lib/public-forms/config";
import { listPublicSubmissions, listLinkablePeople } from "@/lib/public-forms/data";
import { linkSubmission, discardSubmission } from "@/lib/public-forms/actions";

/**
 * People > Submissions. Everything sent through a public form, newest first.
 *
 * A submission whose email matched one active record is already on that person
 * and needs nothing. One we could not match with confidence (unknown email, or
 * two people sharing an email) waits here until a Manager says who it belongs
 * to. Linking creates the Evidence and, for a holiday request, the pending
 * request the approvers see. Nothing is ever guessed and nothing is dropped.
 */

export const metadata: Metadata = { title: "Submissions" };

const MANAGER_PLUS = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
];

function formatDateUk(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export default async function SubmissionsPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (!MANAGER_PLUS.includes(profile.role)) redirect("/people");

  const [submissions, people] = await Promise.all([
    listPublicSubmissions(profile.company_id),
    listLinkablePeople(profile.company_id),
  ]);

  const waiting = submissions.filter((s) => s.status === "unmatched");
  const done = submissions.filter((s) => s.status !== "unmatched");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <RealtimeRefresh tables={["public_form_submissions"]} channel="public-submissions" />
      <BackLink href="/people" label="Back to People" />
      <div>
        <h1 className="page-title">Submissions</h1>
        <p className="page-subtitle">
          Forms your team has sent through a public link. Anything we could not match to a
          record is waiting below for you to link it to the right person.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Waiting to be linked
        </h2>
        {waiting.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">
            Nothing is waiting. Submissions that match a personal email are filed
            automatically.
          </div>
        ) : (
          waiting.map((s) => (
            <div key={s.id} className="glass-card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">
                    {s.submitted_name || "No name given"}
                  </p>
                  <p className="text-sm text-white/60">{s.submitted_email}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {publicFormDef(s.form_key)?.label ?? s.form_key} · sent{" "}
                    {formatWhen(s.created_at)}
                  </p>
                </div>
                <span className="pill-amber">
                  <span className="pill-dot" /> Not matched
                </span>
              </div>

              {s.start_date || s.end_date ? (
                <p className="text-sm text-white/75">
                  {formatDateUk(s.start_date)} to {formatDateUk(s.end_date)}
                </p>
              ) : null}

              <div className="flex flex-wrap items-end gap-3">
                <ActionForm
                  action={linkSubmission}
                  hidden={{ submission_id: s.id }}
                  label="Link"
                  savedLabel="Linked"
                  inline
                >
                  <label htmlFor={`person-${s.id}`} className="form-label">
                    Link this to
                  </label>
                  <select id={`person-${s.id}`} name="person_id" required defaultValue="">
                    <option value="" disabled>
                      Please choose
                    </option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.branch_name ? ` (${p.branch_name})` : ""}
                      </option>
                    ))}
                  </select>
                </ActionForm>

                <ActionForm
                  action={discardSubmission}
                  hidden={{ submission_id: s.id }}
                  label="Discard"
                  savedLabel="Discarded"
                  buttonClassName="btn-outline px-3 py-2 text-xs"
                  className=""
                  confirm="Discard this submission? It will no longer appear in the queue."
                />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Filed
        </h2>
        {done.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">
            Nothing has been filed yet.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {done.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {s.person_id ? (
                      <Link href={`/people/${s.person_id}`} className="hover:text-gold-300">
                        {s.person_name ?? s.submitted_name ?? s.submitted_email}
                      </Link>
                    ) : (
                      (s.person_name ?? s.submitted_name ?? s.submitted_email)
                    )}
                  </p>
                  <p className="text-xs text-white/45">
                    {publicFormDef(s.form_key)?.label ?? s.form_key}
                    {s.branch_name ? ` · ${s.branch_name}` : ""} · sent {formatWhen(s.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="pill-green">
                    {s.status === "matched" ? "Matched" : "Linked"}
                  </span>
                  {s.evidence_id ? (
                    <Link
                      href={`/evidence/${s.evidence_id}`}
                      className="btn-outline px-3 py-2 text-xs"
                    >
                      Evidence
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

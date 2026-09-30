import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { ACCEPTANCE_COLUMNS, type AcceptanceRow } from "@/lib/legal/acceptance";
import { LEGAL_VERSIONS, legalMissing, legalPublished } from "@/lib/legal/documents";
import { acceptanceCurrent, organisationLabel } from "@/lib/legal/fill";
import { setAgreementRequired } from "@/lib/legal/founder-actions";
import { ukDate } from "@/lib/dates";

/**
 * Founder > Agreements (0346). Every company, whether its Company Admin has accepted the agreement
 * in force, and every acceptance ever made with its Order.
 *
 * Before the supplier details are filled in the agreement is a draft and nobody is asked. The
 * "Ask to accept (test)" switch turns the accept screen on for one company, so it can be tried on
 * Bevan first; a test acceptance is marked and does not count once the final text is published.
 */

export const metadata: Metadata = { title: "Agreements" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

export default async function FounderAgreementsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const published = legalPublished();
  const [{ data: cos }, { data: acc }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, tier, status, agreement_required")
      .neq("status", "deleted")
      .order("name"),
    supabase.from("agreement_acceptances").select(ACCEPTANCE_COLUMNS).order("accepted_at", { ascending: false }),
  ]);
  const companies = (cos ?? []) as Array<{
    id: string;
    name: string;
    tier: string | null;
    status: string;
    agreement_required: boolean;
  }>;
  const acceptances = (acc ?? []) as AcceptanceRow[];
  const byCompany = new Map<string, AcceptanceRow[]>();
  for (const a of acceptances) {
    if (!a.company_id) continue;
    byCompany.set(a.company_id, [...(byCompany.get(a.company_id) ?? []), a]);
  }
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Agreements</h1>
        <p className="page-subtitle">
          Subscription Agreement {LEGAL_VERSIONS.agreement} and Data Processing Agreement {LEGAL_VERSIONS.dpa}.{" "}
          <Link href="/terms" target="_blank" className="text-gold-300 underline underline-offset-4">
            Agreement
          </Link>{" "}
          ·{" "}
          <Link href="/dpa" target="_blank" className="text-gold-300 underline underline-offset-4">
            DPA
          </Link>
        </p>
      </div>

      <section className="glass-card p-5">
        {published ? (
          <p className="text-sm text-white/80">
            <span className="pill pill-green mr-2">Published</span>
            Every Company Admin is asked to accept before using the app.
          </p>
        ) : (
          <div className="text-sm text-white/80">
            <p>
              <span className="pill pill-amber mr-2">Draft</span>
              Nobody is asked to accept yet. To publish, fill in lib/legal/supplier.ts:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-white/70">
              {legalMissing().map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white">Companies</h2>
        {companies.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">No companies yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/50">
                <tr>
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Accepted</th>
                  {!published ? <th className="py-2 font-medium">Test</th> : null}
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const rows = byCompany.get(c.id) ?? [];
                  const current = rows.find((r) => acceptanceCurrent([r], LEGAL_VERSIONS, published));
                  const asked = published || c.agreement_required;
                  return (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="py-2 pr-4">
                        <Link href={`/founder/companies/${c.id}`} className="text-white hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {current ? (
                          <span className="pill pill-green">{current.is_draft ? "Accepted (test)" : "Accepted"}</span>
                        ) : asked ? (
                          <span className="pill pill-amber">Waiting for the Admin</span>
                        ) : (
                          <span className="pill pill-neutral">Not asked yet</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-white/70">
                        {current ? `${when(current.accepted_at)} by ${current.accepted_by_name}` : "Not yet"}
                      </td>
                      {!published ? (
                        <td className="py-2">
                          <ActionForm
                            action={setAgreementRequired}
                            hidden={{ company_id: c.id, on: c.agreement_required ? "no" : "yes" }}
                            label={c.agreement_required ? "Stop asking" : "Ask to accept (test)"}
                            buttonClassName="btn-ghost px-2 py-1 text-xs"
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white">Every acceptance</h2>
        {acceptances.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">Nobody has accepted the agreement yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {acceptances.map((a) => (
              <details key={a.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <summary className="cursor-pointer text-sm text-white">
                  {a.company_id ? nameOf.get(a.company_id) ?? a.customer_legal_name : `${a.customer_legal_name} (company deleted)`} ·{" "}
                  {when(a.accepted_at)} · {a.accepted_by_name}
                  {a.is_draft ? <span className="pill pill-amber ml-2">Test of the draft</span> : null}
                </summary>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
                  <dt className="text-white/50">Legal name</dt>
                  <dd className="text-white/80">{a.customer_legal_name}</dd>
                  <dt className="text-white/50">Organisation</dt>
                  <dd className="text-white/80">
                    {organisationLabel(a.organisation_type)}
                    {a.company_number ? `, ${a.company_number}` : ""}
                  </dd>
                  <dt className="text-white/50">Address</dt>
                  <dd className="whitespace-pre-line text-white/80">{a.customer_address}</dd>
                  <dt className="text-white/50">Plan and billing</dt>
                  <dd className="text-white/80">
                    {a.plan}, {a.billing_option === "annual" ? "Annual" : "Monthly"}
                  </dd>
                  <dt className="text-white/50">Price</dt>
                  <dd className="text-white/80">{a.price_text ?? "Not recorded"}</dd>
                  <dt className="text-white/50">Included</dt>
                  <dd className="text-white/80">{a.included_text ?? "Not recorded"}</dd>
                  <dt className="text-white/50">Price List</dt>
                  <dd className="text-white/80">{a.price_list_date ?? "Not recorded"}</dd>
                  <dt className="text-white/50">Onboarding fee</dt>
                  <dd className="text-white/80">{a.onboarding_fee}</dd>
                  <dt className="text-white/50">Start date</dt>
                  <dd className="text-white/80">{ukDate(a.start_date)}</dd>
                  <dt className="text-white/50">Accepted by</dt>
                  <dd className="text-white/80">
                    {a.accepted_by_name} ({a.accepted_by_email}){a.ip ? `, from ${a.ip}` : ""}
                  </dd>
                  <dt className="text-white/50">Versions</dt>
                  <dd className="text-white/80">
                    Agreement {a.agreement_version}, DPA {a.dpa_version}
                  </dd>
                  <dt className="text-white/50">Fingerprints</dt>
                  <dd className="break-all font-mono text-[11px] text-white/60">
                    {a.agreement_sha256.slice(0, 16)}… / {a.dpa_sha256.slice(0, 16)}…
                  </dd>
                </dl>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

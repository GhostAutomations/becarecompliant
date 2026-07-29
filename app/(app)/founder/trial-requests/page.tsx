import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { setTrialRequestStatus } from "@/app/(app)/founder/actions";
import { tierLabel } from "@/lib/founder/format";
import {
  TRIAL_REQUEST_STATUSES,
  trialRequestStatusLabel,
  trialRequestStatusPillClass,
  safeMailto,
  safeTel,
  formatReceivedAt,
} from "@/lib/founder/trial-requests";

/**
 * Founder > Trial requests. Every "Start free trial" from the marketing site, newest
 * first, with somewhere to record what has been done about each one.
 *
 * WHY IT EXISTS. submitTrialRequest writes the row and emails the platform admin, and
 * until now that email was the only place a lead was ever seen. One missed email and a
 * person who asked to buy the product heard nothing back. This screen makes the queue
 * a place rather than an inbox.
 *
 * IT PROVISIONS NOTHING. Setting a request to Provisioned records that the founder has
 * already created the company by hand on Create a company. That is on purpose: setup is
 * founder led, and no screen in this console should quietly mint a tenant.
 *
 * EVERYTHING ON IT WAS TYPED BY A STRANGER. Company name, contact name, message and the
 * rest arrive from an anonymous public form. They are rendered as ordinary React text,
 * which escapes by construction, and nothing here goes near dangerouslySetInnerHTML.
 * The only attributes built from stored values are the mailto: and tel: links, and each
 * is produced by a guard in lib/founder/trial-requests that returns null unless the
 * value plainly is an address or a phone number, in which case it is shown as plain
 * text instead.
 */

export const metadata: Metadata = { title: "Trial requests" };

type TrialRequestRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  tier_interest: string | null;
  team_size: string | null;
  message: string | null;
  source: string;
  status: string;
  notes: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_at: string;
};

export default async function FounderTrialRequestsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("trial_requests")
    .select(
      "id, company_name, contact_name, email, phone, tier_interest, team_size, message, source, status, notes, status_changed_at, status_changed_by, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as TrialRequestRow[];

  // Name whoever last moved each request, in one lookup rather than one per row.
  const actorIds = [...new Set(rows.map((r) => r.status_changed_by).filter(Boolean))] as string[];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const a of (actors ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      actorNames.set(a.id, a.full_name || a.email || "Unknown");
    }
  }

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to founder console" />
        <h1 className="page-title mt-1">Trial requests</h1>
        <p className="page-subtitle">
          Everyone who pressed Start free trial on the website, newest first. Setup
          stays founder led, so nothing here creates a company. Mark a request
          Provisioned once you have created the company yourself.
        </p>
      </div>

      {rows.length > 0 ? (
        <p className="text-sm text-white/60">
          {rows.length} {rows.length === 1 ? "request" : "requests"} ·{" "}
          <span className={newCount > 0 ? "text-amber-300" : ""}>
            {newCount} new
          </span>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            No trial requests yet. Anyone who presses Start free trial on the website
            appears here straight away, and you still get the email.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const mailto = safeMailto(r.email);
            const tel = safeTel(r.phone);
            const movedBy = r.status_changed_by ? actorNames.get(r.status_changed_by) : null;

            return (
              <section key={r.id} className="glass-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">{r.company_name}</h2>
                    <p className="text-sm text-white/60">
                      {r.contact_name} · received {formatReceivedAt(r.created_at)}
                    </p>
                  </div>
                  <span className={`pill ${trialRequestStatusPillClass(r.status)}`}>
                    {trialRequestStatusLabel(r.status)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Email</dt>
                    <dd className="text-white/80">
                      {mailto ? (
                        <a href={mailto} className="underline decoration-white/30 hover:text-white">
                          {r.email}
                        </a>
                      ) : (
                        r.email
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Phone</dt>
                    <dd className="text-white/80">
                      {r.phone ? (
                        tel ? (
                          <a href={tel} className="underline decoration-white/30 hover:text-white">
                            {r.phone}
                          </a>
                        ) : (
                          r.phone
                        )
                      ) : (
                        <span className="text-white/40">Not given</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Interested in</dt>
                    <dd className="text-white/80">
                      {r.tier_interest ? (
                        tierLabel(r.tier_interest)
                      ) : (
                        <span className="text-white/40">Not sure yet</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Team size</dt>
                    <dd className="text-white/80">
                      {r.team_size ?? <span className="text-white/40">Not given</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Came from</dt>
                    <dd className="text-white/80">{r.source}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-white/40">Last moved</dt>
                    <dd className="text-white/80">
                      {r.status_changed_at ? (
                        <>
                          {formatReceivedAt(r.status_changed_at)}
                          {movedBy ? ` by ${movedBy}` : ""}
                        </>
                      ) : (
                        <span className="text-white/40">Not worked yet</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {r.message ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-wide text-white/40">
                      What they said
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                      {r.message}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 border-t border-white/10 pt-4">
                  <ActionForm
                    action={setTrialRequestStatus}
                    hidden={{ request_id: r.id }}
                    label="Save"
                    className="space-y-3"
                  >
                    <div>
                      <label htmlFor={`status-${r.id}`} className="form-label">
                        Status
                      </label>
                      <select id={`status-${r.id}`} name="status" defaultValue={r.status}>
                        {TRIAL_REQUEST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {trialRequestStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`notes-${r.id}`} className="form-label">
                        Notes
                      </label>
                      <textarea
                        id={`notes-${r.id}`}
                        name="notes"
                        rows={3}
                        maxLength={4000}
                        defaultValue={r.notes ?? ""}
                        placeholder="Who you spoke to, what was agreed, when to chase"
                      />
                    </div>
                  </ActionForm>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

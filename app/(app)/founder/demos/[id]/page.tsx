import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { addDemoLogin, deleteDemoNow, emailDemoLogin, endDemoNow, extendDemo } from "@/lib/founder/demo-actions";
import { feedbackAverage, listDemos, type DemoFeedbackRow } from "@/lib/demo/founder-data";
import { DEMO_SURVEY_RATINGS, demoDeleteAt, formatActiveTime, formatDemoDate, type DemoUsage } from "@/lib/demo/rules";

export const metadata: Metadata = { title: "Demo" };

function when(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function UsageBlock({ usage }: { usage: DemoUsage }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-white/50">Times signed in</dt>
          <dd className="text-lg font-semibold text-white">{usage.logins}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Total time</dt>
          <dd className="text-lg font-semibold text-white">{formatActiveTime(usage.totalSeconds)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Average visit</dt>
          <dd className="text-lg font-semibold text-white">{formatActiveTime(usage.averageSeconds)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Last seen</dt>
          <dd className="text-sm font-medium text-white">{when(usage.lastSeen)}</dd>
        </div>
      </dl>
      {usage.areas.length === 0 ? (
        <p className="text-xs text-white/50">No time recorded yet. Time counts only while they are using the demo.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-white/50">Parts used most</p>
          {usage.areas.slice(0, 8).map((a) => (
            <div key={a.area} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-white/80">{a.label}</span>
              <span className="h-2 flex-1 rounded-full bg-white/10">
                <span className="block h-2 rounded-full bg-gold-400/70" style={{ width: `${Math.max(3, a.share)}%` }} />
              </span>
              <span className="w-24 shrink-0 text-right text-xs text-white/60">
                {formatActiveTime(a.seconds)} · {a.share}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackBlock({ f }: { f: DemoFeedbackRow | null }) {
  if (!f || !f.submitted_at) {
    return <p className="text-xs text-white/50">No survey answers yet.</p>;
  }
  const avg = feedbackAverage(f);
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">
        Answered {when(f.submitted_at)} {f.submitted_via === "email" ? "from the email" : "in the demo"}
        {avg !== null ? `, average ${avg} out of 5` : ""}
      </p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {DEMO_SURVEY_RATINGS.map((q) => (
          <div key={q.key} className="flex justify-between gap-3 border-b border-white/5 py-1">
            <dt className="text-white/70">{q.label}</dt>
            <dd className="text-white">{(f[q.key as keyof DemoFeedbackRow] as number | null) ?? "?"} / 5</dd>
          </div>
        ))}
      </dl>
      {(
        [
          ["What they liked", f.liked],
          ["What they did not like", f.disliked],
          ["What we could do better", f.better],
        ] as const
      ).map(([label, text]) => (
        <div key={label}>
          <p className="text-xs text-white/50">{label}</p>
          <p className="whitespace-pre-wrap text-sm text-white/85">{text || "Nothing written."}</p>
        </div>
      ))}
    </div>
  );
}

export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ problem?: string; created?: string; why?: string; emailed?: string; mailwhy?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { problem, created, why, emailed, mailwhy } = await searchParams;
  const [demo] = await listDemos(id);
  if (!demo) notFound();
  const live = !demo.deletedAt;
  const ended = demo.phase === "ended" || demo.phase === "purge_due";
  const canEmail = live && !ended;

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/founder/demos" label="Back to Demos" />
      <div>
        <h1 className="page-title">Demo for {demo.clientName}</h1>
        <p className="page-subtitle">
          {demo.deletedAt
            ? `Deleted ${formatDemoDate(demo.deletedAt)}. Its usage and feedback are kept here.`
            : ended
              ? `Ended ${formatDemoDate(demo.endsAt)}. The demo company is deleted ${formatDemoDate(demoDeleteAt(demo.endsAt).toISOString())}.`
              : `Runs until ${formatDemoDate(demo.endsAt)}. They see Demo Care Company Limited.`}
        </p>
      </div>

      {created ? (
        <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {emailed === "1"
            ? `The demo is ready, and ${demo.logins[0]?.fullName ?? "they"} has been emailed the login details (${demo.logins[0]?.email ?? ""}, the password you chose, and how to get started).`
            : `The demo is ready. Give ${demo.logins[0]?.fullName ?? "them"} the email ${demo.logins[0]?.email ?? ""} and the password you chose, and send them to becarecompliant.com/login, or email them the details with Send login email below.`}
        </p>
      ) : null}
      {created && emailed === "0" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          The login email was not sent{mailwhy ? `: ${mailwhy.slice(0, 300)}` : "."} Use Send login email below, or give them the details yourself.
        </p>
      ) : null}
      {problem === "login" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          The demo company was built but the login could not be made. Add it again below.
          {why ? <span className="mt-1 block">Reason: {why.slice(0, 300)}</span> : null}
        </p>
      ) : null}
      {problem === "seed" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          The demo was set up, but the sample data could not be added, so it is empty. Delete it and set up another, and tell Claude.
        </p>
      ) : null}

      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-white/80">How much it was used</h2>
        <UsageBlock usage={demo.usage} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white/80">Logins</h2>
        {demo.logins.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">No logins yet.</div>
        ) : (
          demo.logins.map((l) => (
            <div key={l.id} className="glass-card space-y-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-white">{l.fullName}</p>
                <p className="text-sm text-white/60">
                  {l.email} · AI used {l.aiUsed} of {l.aiAllowance}
                </p>
              </div>
              {demo.logins.length > 1 ? <UsageBlock usage={l.usage} /> : null}
              {canEmail ? (
                <details className="border-t border-white/10 pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-gold-200">Send login email</summary>
                  <p className="mt-2 text-xs text-white/50">
                    Emails {l.fullName} a button to log in, their email and password, the end date and how to get started.
                    Passwords are never stored, so type it again. Whatever you type here becomes their password, so the
                    email is always right.
                  </p>
                  <ActionForm
                    action={emailDemoLogin}
                    hidden={{ demo_id: demo.id, login_id: l.id }}
                    label="Send login email"
                    savingLabel="Sending…"
                    savedLabel="Sent"
                    className="mt-3 space-y-3"
                  >
                    <div>
                      <label htmlFor={`pw_${l.id}`} className="form-label">Their password *</label>
                      <input id={`pw_${l.id}`} name="password" type="text" required minLength={8} autoComplete="off" />
                    </div>
                  </ActionForm>
                </details>
              ) : null}
              <div className="border-t border-white/10 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Their feedback</h3>
                <FeedbackBlock f={l.feedback} />
              </div>
            </div>
          ))
        )}
      </section>

      {live ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-white/80">Add another login</h2>
            <p className="mt-1 text-xs text-white/50">Each login has its own 5 AI credits and its own figures above.</p>
            <ActionForm action={addDemoLogin} hidden={{ demo_id: demo.id }} label="Add login" savingLabel="Adding…" savedLabel="Added" className="mt-3 space-y-3">
              <div>
                <label htmlFor="add_full_name" className="form-label">Their name *</label>
                <input id="add_full_name" name="full_name" required />
              </div>
              <div>
                <label htmlFor="add_email" className="form-label">Their email *</label>
                <input id="add_email" name="email" type="email" required />
              </div>
              <div>
                <label htmlFor="add_password" className="form-label">Password you will give them *</label>
                <input id="add_password" name="password" type="text" required minLength={8} autoComplete="off" />
                <p className="form-hint">At least 8 characters. Passwords found in leaked password lists online are refused, so pick something unusual.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="send_email" defaultChecked />
                Email them their login details
              </label>
            </ActionForm>
          </div>

          <div className="glass-card space-y-5 p-5">
            <div>
              <h2 className="text-sm font-semibold text-white/80">Extend</h2>
              <p className="mt-1 text-xs text-white/50">
                Adds days to the end date, or from today if it has already ended. The survey email is sent again when the new date passes, if they have not answered.
              </p>
              <ActionForm action={extendDemo} hidden={{ demo_id: demo.id }} label="Extend" savingLabel="Extending…" savedLabel="Extended" inline className="mt-3">
                <input name="days" inputMode="numeric" placeholder="7" aria-label="Days to add" />
              </ActionForm>
            </div>
            {!ended ? (
              <div className="border-t border-white/10 pt-4">
                <h2 className="text-sm font-semibold text-white/80">End now</h2>
                <p className="mt-1 text-xs text-white/50">Their logins stop straight away. The company is still deleted 14 days later.</p>
                <ActionForm action={endDemoNow} hidden={{ demo_id: demo.id }} label="End the demo now" savingLabel="Ending…" savedLabel="Ended" buttonClassName="btn-outline text-xs" className="mt-3" />
              </div>
            ) : null}
            <div className="border-t border-white/10 pt-4">
              <h2 className="text-sm font-semibold text-white/80">Delete now</h2>
              <p className="mt-1 text-xs text-white/50">
                Deletes the demo company, its records and its logins now, instead of 14 days after the end. Usage and feedback stay here. Type DELETE to confirm.
              </p>
              <ActionForm action={deleteDemoNow} hidden={{ demo_id: demo.id }} label="Delete the demo company" savingLabel="Deleting…" savedLabel="Deleted" buttonClassName="btn-outline text-xs" inline className="mt-3">
                <input name="confirm" aria-label="Type DELETE" placeholder="DELETE" autoComplete="off" />
              </ActionForm>
            </div>
            {demo.companyId ? (
              <p className="border-t border-white/10 pt-4 text-xs text-white/50">
                To look inside it, open{" "}
                <Link href={`/founder/companies/${demo.companyId}`} className="underline decoration-white/30 hover:text-white">
                  the demo company
                </Link>{" "}
                and use Manage as company. Your time there is not counted.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { resendConfigured } from "@/lib/email/resend";
import { twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "Health" };

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

type Dep = { label: string; ok: boolean; detail: string };

export default async function FounderHealthPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: failures }, { data: events }, { data: lastLog }, { data: companies }] =
    await Promise.all([
      supabase
        .from("notification_log")
        .select("id, company_id, channel, kind, status, error, to_address, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("stripe_events")
        .select("id, type, status, error, company_id, received_at, processed_at")
        .neq("status", "processed")
        .order("received_at", { ascending: false })
        .limit(30),
      supabase
        .from("notification_log")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("companies").select("id, name"),
    ]);

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));

  // Environment dependencies. These reads are server-only (this is not a client
  // component and process.env is never serialised to the browser).
  const deps: Dep[] = [
    {
      label: "Email (Resend)",
      ok: resendConfigured(),
      detail: "RESEND_API_KEY, RESEND_FROM",
    },
    {
      label: "SMS (Twilio)",
      ok: twilioConfigured(),
      detail: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM",
    },
    {
      label: "AI (Anthropic)",
      ok: Boolean(process.env.ANTHROPIC_API_KEY),
      detail: "ANTHROPIC_API_KEY",
    },
    {
      label: "Stripe billing",
      ok: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      detail: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET",
    },
    {
      label: "Stripe seat price",
      ok: Boolean(process.env.STRIPE_PRICE_SEAT),
      detail: "STRIPE_PRICE_SEAT",
    },
    {
      label: "Cron secret",
      ok: Boolean(process.env.CRON_SECRET),
      detail: "CRON_SECRET (digest + usage crons fail closed without it)",
    },
    {
      label: "Supabase service role",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      detail: "SUPABASE_SERVICE_ROLE_KEY (invites, audit, webhooks)",
    },
  ];
  const missing = deps.filter((d) => !d.ok).length;

  const lastActivityIso = lastLog?.[0]?.created_at ?? null;
  const hoursSince = lastActivityIso
    ? (Date.now() - new Date(lastActivityIso).getTime()) / 3_600_000
    : null;
  const digestStale = hoursSince !== null && hoursSince > 26;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Platform health</h1>
        <p className="page-subtitle">
          Dependencies, failed sends and webhook processing at a glance, so you can
          see platform health without digging through logs.
        </p>
      </div>

      <section aria-label="Dependencies" className="glass-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">Dependencies</h2>
          <span className={`pill ${missing === 0 ? "pill-green" : "pill-red"}`}>
            {missing === 0 ? "All configured" : `${missing} missing`}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {deps.map((d) => (
            <div
              key={d.label}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-white/90">{d.label}</p>
                <p className="truncate text-xs text-white/40">{d.detail}</p>
              </div>
              <span className={`pill ${d.ok ? "pill-green" : "pill-red"}`}>
                {d.ok ? "Set" : "Missing"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/40">
          A missing dependency means that feature silently no ops. Env changes take
          effect only after a redeploy.
        </p>
      </section>

      <section aria-label="Cron freshness" className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/80">Daily jobs</h2>
            <p className="mt-1 text-xs text-white/50">
              Last notification activity: {fmtTime(lastActivityIso)}
            </p>
          </div>
          <span className={`pill ${digestStale ? "pill-amber" : "pill-green"}`}>
            {lastActivityIso === null
              ? "No activity yet"
              : digestStale
                ? "No send in 24h+"
                : "Recent"}
          </span>
        </div>
      </section>

      <section aria-label="Send failures" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Failed email and SMS ({(failures ?? []).length})
        </h2>
        {(failures ?? []).length === 0 ? (
          <p className="text-sm text-white/60">No failed sends recorded. Good.</p>
        ) : (
          <div className="space-y-2">
            {(failures ?? []).map((f) => (
              <div
                key={f.id}
                className="border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-white/90">
                    <span className="pill pill-neutral mr-2">{f.channel}</span>
                    {f.kind} · {companyName.get(f.company_id ?? "") ?? "unknown"}
                  </span>
                  <span className="text-xs text-white/40">{fmtTime(f.created_at)}</span>
                </div>
                {f.error ? (
                  <p className="mt-0.5 text-xs text-red-300">{f.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Webhooks" className="glass-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Stripe webhooks needing attention ({(events ?? []).length})
        </h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-white/60">
            All recent webhook events processed cleanly.
          </p>
        ) : (
          <div className="space-y-2">
            {(events ?? []).map((e) => (
              <div
                key={e.id}
                className="border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-white/90">
                    <span
                      className={`pill mr-2 ${e.status === "failed" ? "pill-red" : "pill-amber"}`}
                    >
                      {e.status}
                    </span>
                    {e.type}
                  </span>
                  <span className="text-xs text-white/40">{fmtTime(e.received_at)}</span>
                </div>
                {e.error ? (
                  <p className="mt-0.5 text-xs text-red-300">{e.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-white/40">
          Deeper webhook and cron run logs live in Vercel. This surfaces the
          events the platform itself recorded as unprocessed or failed.
        </p>
      </section>
    </div>
  );
}

import Link from "next/link";

/**
 * The line that was missing entirely (Phil, 2026-08-20): a company can run over its allowance,
 * with no subscription at all, and nothing anywhere says so. Founder-created tenants get no
 * trial clock either, so nothing ever lapses and nothing ever asks.
 *
 * Deliberately NOT a lock and NOT a nag: it appears only when there is something true and
 * specific to say, and only to somebody who can act on it (the Company Admin). A compliance
 * product interrupting a manager mid-audit about a bill she cannot pay would be worse than the
 * silence it replaces.
 */
export default function BillingAttention({
  message,
  cta = "Set up billing",
}: {
  message: string;
  cta?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-3"
    >
      <p className="text-sm text-gold-100">{message}</p>
      <Link href="/settings/billing" className="btn-primary shrink-0 px-3 py-1.5 text-xs">
        {cta}
      </Link>
    </div>
  );
}

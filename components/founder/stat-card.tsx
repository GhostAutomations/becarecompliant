import type { ReactNode } from "react";
import Link from "next/link";

/**
 * A single headline metric on the founder dashboard. Presentational, but when an
 * href is given it becomes a link to the relevant founder tile (hover affordance).
 */
export function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/50">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="glass-card block p-5 transition hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
      >
        {body}
      </Link>
    );
  }

  return <div className="glass-card p-5">{body}</div>;
}

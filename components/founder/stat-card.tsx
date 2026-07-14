import type { ReactNode } from "react";

/** A single headline metric on the founder dashboard. Presentational only. */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-white/50">{sub}</p> : null}
    </div>
  );
}

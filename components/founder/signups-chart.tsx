// Sign-ups over time. Inline SVG bar chart, server rendered, no chart library
// and no client JS. Gold bars (brand accent), calm gridless layout.

export function SignupsChart({
  data,
}: {
  data: { key: string; label: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="glass-card px-6 py-10 text-center">
        <p className="text-sm text-white/60">
          No sign-ups in this window yet. New companies appear here as you create
          them.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white/80">Sign-ups over time</h3>
        <span className="text-xs text-white/50">
          {total} in the last {data.length} months
        </span>
      </div>
      <div className="flex items-end gap-2" style={{ height: 140 }}>
        {data.map((d) => {
          const h = Math.round((d.count / max) * 116);
          return (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-medium text-white/70">
                {d.count > 0 ? d.count : ""}
              </span>
              <div
                className="w-full rounded-sm bg-gold-400/80"
                style={{ height: Math.max(2, h) }}
                title={`${d.label}: ${d.count}`}
                aria-label={`${d.label}: ${d.count} sign-ups`}
              />
              <span className="text-[10px] text-white/40">
                {d.label.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

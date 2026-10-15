/** Shown the moment Clock in is opened, until it is ready: the title and two cards. */
export default function ClockLoading() {
  return (
    <div className="page-shell mx-auto max-w-xl space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-7 w-32 rounded-lg bg-white/10 motion-safe:animate-pulse" />
        <div className="h-4 w-72 max-w-full rounded-lg bg-white/5 motion-safe:animate-pulse" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="glass-card space-y-2 p-4" aria-hidden="true">
          <div className="h-4 w-40 rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="h-4 w-56 rounded bg-white/5 motion-safe:animate-pulse" />
          <div className="h-11 w-full rounded-xl bg-white/10 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

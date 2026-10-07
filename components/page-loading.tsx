/**
 * Be Care Compliant: the loading frame shown the moment a page is clicked (speed plan,
 * 2026-10-07).
 *
 * WHY. No page had a loading.tsx, so in Next 15 a click on any page waited, with nothing moving,
 * until the whole server render was finished, and Next could not prefetch a page either. Every
 * page folder now has a loading.tsx that renders this, so the click answers at once with the
 * page's frame, and the real page replaces it when it is ready.
 *
 * Calm on purpose: the same glass cards as the real pages, a soft pulse that stops for anyone who
 * has asked their device to reduce motion, and one line read out to screen readers.
 */
export default function PageLoading() {
  return (
    <div className="page-shell space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-7 w-56 rounded-lg bg-white/10 motion-safe:animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-white/5 motion-safe:animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card h-28 p-4">
            <div className="h-3 w-24 rounded bg-white/10 motion-safe:animate-pulse" />
            <div className="mt-4 h-8 w-16 rounded bg-white/10 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <div className="glass-card space-y-3 p-4" aria-hidden="true">
        {["w-11/12", "w-10/12", "w-9/12", "w-8/12", "w-7/12", "w-6/12"].map((w) => (
          <div key={w} className={`h-4 ${w} rounded bg-white/5 motion-safe:animate-pulse`} />
        ))}
      </div>
    </div>
  );
}

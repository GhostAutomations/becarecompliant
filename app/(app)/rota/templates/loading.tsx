/**
 * Shown the moment Rota is clicked, until it is ready. Shaped like the page: title, the beta
 * notice and one card (the shared PageLoading frame has four stat tiles this page does not have).
 */
export default function RotaLoading() {
  return (
    <div className="page-shell space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-7 w-40 rounded-lg bg-white/10 motion-safe:animate-pulse" />
        <div className="h-4 w-72 max-w-full rounded-lg bg-white/5 motion-safe:animate-pulse" />
      </div>
      <div className="glass-card space-y-2 p-4" aria-hidden="true">
        <div className="h-4 w-40 rounded bg-white/10 motion-safe:animate-pulse" />
        <div className="h-4 w-11/12 rounded bg-white/5 motion-safe:animate-pulse" />
        <div className="h-4 w-9/12 rounded bg-white/5 motion-safe:animate-pulse" />
      </div>
      <div className="glass-card space-y-3 p-6" aria-hidden="true">
        <div className="mx-auto h-5 w-48 rounded bg-white/10 motion-safe:animate-pulse" />
        <div className="mx-auto h-4 w-80 max-w-full rounded bg-white/5 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

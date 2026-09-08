"use client";

/**
 * Be Care Compliant — the friendly screen behind every error boundary.
 *
 * THE ERROR THIS EXISTS FOR. BCC allows one session per user (claim_session on sign in),
 * so signing in on another device ends the session here. The next Server Action then
 * receives the login page instead of an action result and React throws "An unexpected
 * response was received from the server". A deploy has the same effect on a tab that was
 * already open, because the action id in the old bundle no longer exists on the new one.
 *
 * Without a boundary that crashes to Next's own "Application error: a client-side
 * exception has occurred" page: white text on a blank screen, naming the site rather than
 * the problem, with no way back except knowing to hard refresh.
 *
 * ONE SCREEN, TWO BOUNDARIES (Phil, 2026-09-08, who hit it on the sign in page in Edge).
 * app/(app)/error.tsx has caught this inside the app since it was written. Everything
 * OUTSIDE the app group -- sign in, welcome, pricing, start a trial, the public forms --
 * had no boundary at all, so the one place a locked out person lands was the one place
 * that showed them the raw crash. Both boundaries now render this.
 */

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const sessionEnded = /unexpected response/i.test(error?.message ?? "");
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold text-white">
          {sessionEnded ? "Your session has ended" : "Something went wrong"}
        </h1>
        <p className="text-sm text-white/70">
          {sessionEnded
            ? "This usually happens when the same account signs in on another device, or when the site was updated while this page was open. Sign in again to carry on. Anything saved before this message was stored safely."
            : "Please try again. If it keeps happening, sign out and back in."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {/* A full page load, not a client navigation: the router state is not
              trustworthy once an action response has failed to parse. */}
          <a href="/login" className="btn-primary">Go to sign in</a>
          <button type="button" className="btn-ghost" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

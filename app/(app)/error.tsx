"use client";

/**
 * Be Care Compliant — friendly error boundary for the app section.
 *
 * The main real-world trigger: BCC allows one session per user (claim_session
 * on sign-in), so signing in on another device ends the session here. The next
 * Server Action then receives the login page instead of an action result and
 * React throws "An unexpected response was received from the server". Without
 * this boundary that crashes to a blank "Application error" screen; with it,
 * the user gets a plain explanation and a way back in. Any other unexpected
 * render error lands here too, with a retry.
 */

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const sessionEnded = /unexpected response/i.test(error?.message ?? "");
  return (
    <div className="mx-auto max-w-md py-16">
      <div className="glass-card space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold text-white">
          {sessionEnded ? "Your session has ended" : "Something went wrong"}
        </h1>
        <p className="text-sm text-white/70">
          {sessionEnded
            ? "This usually happens when the same account signs in on another device. Sign in again to carry on. Anything saved before this message was stored safely."
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

import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password" };

/** "Forgot your password?" (2026-09-23). Public, under /login so the middleware already lets it
 *  through without a session. */
export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const invite = reason === "invite";
  return (
    <main className="auth-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Be Care <span className="text-gold-400">Compliant</span>
          </h1>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">
            {invite ? "Get a new invitation link" : "Reset your password"}
          </h2>
          <p className="mt-1 mb-5 text-sm text-white/60">
            {invite
              ? "Enter the email address your invitation was sent to and we will send you a fresh link to set up your login."
              : "Enter the email address you sign in with and we will send you a link to set a new password."}
          </p>
          <ForgotForm
            notice={
              reason === "expired"
                ? "That reset link has expired or has already been used. Ask for a new one below."
                : invite
                  ? "That invitation link has expired or has already been used. Ask for a new one below."
                  : undefined
            }
            buttonLabel={invite ? "Send me a new link" : undefined}
          />
        </div>
        <p className="mt-6 text-center text-sm">
          <a href="/login" className="text-gold-300 hover:text-gold-200">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}

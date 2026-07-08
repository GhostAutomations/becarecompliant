import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LOGIN_REASON_MESSAGES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice = reason ? LOGIN_REASON_MESSAGES[reason] : undefined;

  return (
    <main className="auth-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 ring-1 ring-gold-400/40">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.8"
              className="h-8 w-8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Be Care <span className="text-gold-400">Compliant</span>
          </h1>
          <p className="text-sm text-white/60">
            Inspection ready, every day of the year.
          </p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <LoginForm notice={notice} />
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          CQC and CIW compliance for UK care companies
        </p>
      </div>
    </main>
  );
}

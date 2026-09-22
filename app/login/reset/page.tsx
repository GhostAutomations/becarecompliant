import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESET_EXPIRED_PATH } from "@/lib/auth/password-reset-rules";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Set a new password (2026-09-23). Reached only from a reset email: /auth/confirm checks the one
 * time token, signs them in, and sends them here. Under /login, so the middleware lets it render;
 * the session check is done here instead.
 */
export default async function ResetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(RESET_EXPIRED_PATH);

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  // Somebody whose invitation is still open sets their first password on Welcome, not here.
  if (profile?.status === "invited") redirect("/welcome");
  if (profile?.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?reason=no-access");
  }

  return (
    <main className="auth-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Be Care <span className="text-gold-400">Compliant</span>
          </h1>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">Set a new password</h2>
          <p className="mt-1 mb-5 text-sm text-white/60">
            Choosing a new password signs you out of Be Care Compliant everywhere else.
          </p>
          <ResetForm email={user.email ?? ""} />
        </div>
      </div>
    </main>
  );
}

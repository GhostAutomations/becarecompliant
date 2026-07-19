import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .maybeSingle();

  // Already set up: straight to the app.
  if (profile?.status === "active") redirect("/dashboard");

  return (
    <main className="auth-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-md p-8">
        <div className="mb-6">
          <span className="text-sm font-bold text-white">
            Be Care <span className="text-gold-400">Compliant</span>
          </span>
          <h1 className="page-title mt-3">Welcome</h1>
          <p className="page-subtitle">
            Set a password to finish setting up your account.
          </p>
        </div>
        <WelcomeForm defaultName={profile?.full_name ?? ""} email={user.email ?? ""} />
      </div>
    </main>
  );
}

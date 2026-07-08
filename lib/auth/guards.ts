import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  role:
    | "platform_admin"
    | "company_admin"
    | "manager"
    | "supervisor"
    | "team_member";
  status: "invited" | "active" | "disabled";
};

/** Returns the authenticated user, or null. Never redirects. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Requires an authenticated user AND enforces single-session:
 * if this session is no longer the user's active session (they signed in
 * elsewhere), the user is signed out with a clear message.
 * Every protected page goes through this.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const currentSessionId = decodeSessionId(session.access_token);
    if (currentSessionId) {
      const { data: active } = await supabase
        .from("user_sessions")
        .select("session_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (active && active.session_id !== currentSessionId) {
        await supabase.auth.signOut();
        redirect("/login?reason=signed-out-elsewhere");
      }

      if (!active) {
        // Self-heal: claim this session (idempotent upsert).
        await supabase.rpc("claim_session", { p_session_id: currentSessionId });
      }
    }
  }

  return user;
}

/** Requires a user and returns their profile. */
export async function requireProfile(): Promise<{
  user: User;
  profile: Profile;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login?reason=no-access");
  }

  return { user, profile: profile as Profile };
}

/** Requires an active member of a company (platform admin also passes). */
export async function requireCompany(): Promise<{
  user: User;
  profile: Profile;
}> {
  const { user, profile } = await requireProfile();
  if (profile.role === "platform_admin") return { user, profile };
  if (!profile.company_id) redirect("/login?reason=no-access");
  return { user, profile };
}

/** Requires a Company Admin of their company (platform admin also passes). */
export async function requireCompanyAdmin(): Promise<{
  user: User;
  profile: Profile;
}> {
  const { user, profile } = await requireCompany();
  if (profile.role === "platform_admin" || profile.role === "company_admin") {
    return { user, profile };
  }
  redirect("/dashboard");
}

/** Requires the Founder / Platform Admin. */
export async function requirePlatformAdmin(): Promise<{
  user: User;
  profile: Profile;
}> {
  const { user, profile } = await requireProfile();
  if (profile.role !== "platform_admin") redirect("/dashboard");
  return { user, profile };
}

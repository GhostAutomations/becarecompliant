import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";
import { readActingCompanyId } from "@/lib/founder/manage-as";
import { isCompanyLapsed } from "@/lib/billing/trial-gate";

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
    | "team_member"
    | "on_call"
    /** Carer self-service login, shown as "Team Member" (migration 0131). NOT the
     *  same as 'team_member', which is the older read-only Viewer role. */
    | "staff";
  status: "invited" | "active" | "disabled";
  /** Set when a platform admin is operating inside a tenant via manage-as. The
   *  profile is shadowed to that company with a company_admin role for scoping;
   *  this flag lets callers know the real user is the founder impersonating. */
  actingAsCompanyId?: string;
};

/**
 * When the real user is the platform admin AND a valid manage-as cookie is set,
 * return a shadow profile scoped to that company with a company_admin role, so
 * every existing tenant page and action works unchanged. Otherwise return the
 * profile as-is. Never shadows a non-platform-admin (a forged cookie is inert).
 */
async function applyManageAs(profile: Profile): Promise<Profile> {
  if (profile.role !== "platform_admin") return profile;
  const acting = await readActingCompanyId();
  if (!acting) return profile;
  return {
    ...profile,
    company_id: acting,
    role: "company_admin",
    actingAsCompanyId: acting,
  };
}

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

export type CompanyGuardOptions = {
  /**
   * Let a company through whose 14 day trial has run out.
   *
   * Set by exactly two callers: the Trial ended page itself, and the billing actions that
   * open Stripe Checkout or the Customer Portal. Everything else gets the default, which is
   * why the lock cannot be missed: every page, every server action and all nineteen export
   * routes reach their tenant through this one function, so none of them had to remember
   * anything. Adding a new route gates itself.
   */
  allowLapsed?: boolean;
};

/** Requires an active member of a company (platform admin also passes). When
 *  the founder is managing as a company, the profile is shadowed to it.
 *
 *  THE TRIAL LOCK LIVES HERE, and the founder is checked BEFORE it on purpose: managing as
 *  a company whose trial has lapsed is exactly when he most needs to get in, to look at it
 *  or to put it right. */
export async function requireCompany(
  options: CompanyGuardOptions = {},
): Promise<{
  user: User;
  profile: Profile;
}> {
  const { user, profile } = await requireProfile();
  if (profile.role === "platform_admin") {
    return { user, profile: await applyManageAs(profile) };
  }
  if (!profile.company_id) redirect("/login?reason=no-access");
  if (!options.allowLapsed && (await isCompanyLapsed(profile.company_id))) {
    // No query string on this redirect: redirecting a Server Action to a URL carrying one
    // trips the Next 15 router bug this codebase has already paid for (see lib/forms).
    redirect("/trial-ended");
  }
  return { user, profile };
}

/** Requires a Company Admin of their company (platform admin also passes). */
export async function requireCompanyAdmin(
  options: CompanyGuardOptions = {},
): Promise<{
  user: User;
  profile: Profile;
}> {
  const { user, profile } = await requireCompany(options);
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

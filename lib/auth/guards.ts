import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginPath } from "@/lib/auth/safe-next";
import { deviceKindFrom } from "@/lib/auth/device-kind";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decodeSessionId } from "@/lib/auth/jwt";
import { readActingCompanyId } from "@/lib/founder/manage-as";
import { isCompanyLapsed, isCompanyLocked } from "@/lib/billing/trial-gate";

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  role:
    | "platform_admin"
    | "company_admin"
    /** The two company wide registered roles (CIW/CQC). They were missing from
     *  this union while profiles_role_check has allowed them for months, so the
     *  role lists that name them, such as the Holiday page's canApprove, were
     *  comparing against a type that said they could not exist. */
    | "registered_individual"
    | "registered_manager"
    | "manager"
    | "supervisor"
    /** Recruiter: a Supervisor without the branch, company wide (0310). */
    | "recruiter"
    | "team_member"
    | "on_call"
    /** Carer self-service login, shown as "Team Member" (migration 0131). NOT the
     *  same as 'team_member', which is the older read-only Viewer role. */
    | "staff";
  status: "invited" | "active" | "disabled";
  /**
   * The company's OWN role this person carries, if any (0314). `role` above is still the
   * built-in role it copies, and that is what every policy reads: this only narrows which
   * departments they are shown, and gives the role the name their company chose.
   */
  company_role_id?: string | null;
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

/**
 * Where to send somebody who has to sign in, keeping hold of the page they asked for.
 *
 * The path comes from the x-pathname header middleware sets, because a Server Component cannot
 * read its own URL. loginPath sanitises it: this value ends up in a redirect, and a redirect
 * that follows whatever it is handed is an open redirect.
 */
async function signInHere(reason?: string): Promise<string> {
  const h = await headers();
  return loginPath(reason, h.get("x-pathname"));
}

export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await signInHere());

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const currentSessionId = decodeSessionId(session.access_token);
    if (currentSessionId) {
      /*
       * ONE DESKTOP SLOT AND ONE MOBILE SLOT (Phil, 2026-09-15; migration 0273). This used to
       * read a single row and evict anything that did not match it, so a person's own phone and
       * their own computer fought each other all day. Now a person may hold two rows, and the
       * question is whether THIS session is still in one of them.
       *
       * Still an eviction, just a narrower one: a second phone displaces the first phone and a
       * second computer displaces the first computer, so a shared password still produces the
       * tell that made single session worth having.
       */
      const { data: slots } = await supabase
        .from("user_sessions")
        .select("session_id")
        .eq("user_id", user.id);

      const held = slots ?? [];
      const stillMine = held.some((s) => s.session_id === currentSessionId);

      if (held.length > 0 && !stillMine) {
        /* LOCAL, and this one matters most. The session being turned away here is the one that
           was DISPLACED. Signing it out globally ended every session the person had, including the
           new one that displaced it and their other kind of device: sign in on a second phone and
           the old phone's next click signed out the new phone and the computer as well. */
        await supabase.auth.signOut({ scope: "local" });
        redirect(await signInHere("signed-out-elsewhere"));
      }

      if (held.length === 0) {
        // Self-heal: claim the slot for whatever this device is (idempotent upsert).
        await supabase.rpc("claim_session", {
          p_session_id: currentSessionId,
          p_device_kind: deviceKindFrom((await headers()).get("user-agent")),
        });
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
    .select("id, company_id, full_name, email, role, status, company_role_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status === "disabled") {
    // GLOBAL on purpose: a switched off login is ended on every device it holds.
    await supabase.auth.signOut({ scope: "global" });
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
  /* THE COMPANY LOCK, and it comes before the trial lock because it is the stronger of the two:
     a suspended, archived or deleted company is shut whether or not its trial has anything left
     to run. allowLapsed deliberately does NOT open this door — the two billing actions it exists
     for are "add a card and carry on", which is not on offer to a company that has been shut.
     No query string on the redirect (see the Next 15 note below). */
  if (await isCompanyLocked(profile.company_id)) redirect("/company-closed");
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

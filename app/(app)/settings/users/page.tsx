import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/nav";
import BackLink from "@/components/back-link";
import RealtimeRefresh from "@/components/realtime-refresh";
import { InviteForm } from "@/components/settings/invite-form";
import UserDropdown from "@/components/settings/user-dropdown";
import type { UserListItem } from "@/components/settings/user-popup";
import ActionForm from "@/components/action-form";
import { resendInviteAction, revokeInviteAction } from "../actions";

export const metadata: Metadata = { title: "Users and invites" };

function roleRank(role: string): number {
  return [
    "company_admin",
    "registered_individual",
    "registered_manager",
    "manager",
    "supervisor",
    "on_call",
    "team_member",
    "staff",
  ].indexOf(role);
}

/**
 * Two kinds of login, kept apart (Phil, 2026-07-26). ACTIVE users run the
 * service: they open records, complete checks and make decisions, and they are
 * the ones you pay a seat for. PASSIVE users are the workforce: a Team Member
 * login only reaches their own area, and it is free.
 *
 * Note the word "active" here is about what the login DOES, not the account
 * status pill on each row, which is why both headings carry a subtitle.
 */
const PASSIVE_ROLES = ["staff", "team_member"];

export default async function UsersPage() {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const companyId = profile.company_id;

  const supabase = await createClient();
  const [{ data: branches }, { data: users }, { data: invites }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, kind, status")
        .eq("company_id", companyId)
        .order("kind", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, status")
        .eq("company_id", companyId)
        .neq("role", "platform_admin"),
      supabase
        .from("invites")
        .select("id, email, full_name, role, branch_id, last_sent_at, resend_count")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const branchList = branches ?? [];
  const activeBranches = branchList.filter((b) => b.status === "active");
  const branchName = new Map(branchList.map((b) => [b.id, b.name]));

  // Branch assignments for the company's users, split into the primary branch and the
  // additional branch views.
  const branchIds = branchList.map((b) => b.id);
  const primaryByUser = new Map<string, string>();
  const additionalByUser = new Map<string, string[]>();
  if (branchIds.length > 0) {
    const { data: ub } = await supabase
      .from("user_branches")
      .select("user_id, branch_id, is_primary")
      .in("branch_id", branchIds);
    for (const row of ub ?? []) {
      if (!branchName.has(row.branch_id)) continue;
      if (row.is_primary) primaryByUser.set(row.user_id, row.branch_id);
      else additionalByUser.set(row.user_id, [...(additionalByUser.get(row.user_id) ?? []), row.branch_id]);
    }
  }

  const userList = (users ?? []).sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) ||
      (a.full_name || a.email).localeCompare(b.full_name || b.email),
  );
  const activeUsers = userList.filter((u) => !PASSIVE_ROLES.includes(u.role));
  const passiveUsers = userList.filter((u) => PASSIVE_ROLES.includes(u.role));
  const pending = invites ?? [];

  const branchOptions = activeBranches
    .filter((b) => b.kind === "branch")
    .map((b) => ({ id: b.id, name: b.name }));

  /**
   * One user as plain data for the dropdown. The list itself is a real dropdown
   * panel of names (Phil, 2026-07-26), so nothing is rendered down the page.
   */
  function toItem(u: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
  }): UserListItem {
    const isSelf = u.id === user.id;
    const isAdmin = u.role === "company_admin";
    const primaryId = primaryByUser.get(u.id) ?? null;
    const additionalIds = additionalByUser.get(u.id) ?? [];
    const branchNames = [
      primaryId ? branchName.get(primaryId) : null,
      ...additionalIds.map((id) => branchName.get(id)),
    ].filter(Boolean) as string[];
    return {
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
      status: u.status,
      isSelf,
      canManage: !isSelf && !isAdmin,
      primaryBranchId: primaryId,
      additionalBranchIds: additionalIds,
      branchSummary: isAdmin
        ? "All branches"
        : branchNames.length > 0
          ? branchNames.join(", ")
          : "No branch",
    };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Live refresh: the pending and team lists update the instant an invite is
          accepted or a user changes, no manual refresh. RLS scopes events. */}
      <RealtimeRefresh tables={["invites", "profiles"]} channel="users-live" />
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Users and invites</h1>
        <p className="page-subtitle">
          Invite your team and manage roles and branches. Only Admins can invite
          or change roles.
        </p>
      </div>

      <section className="glass-card p-6">
        <h2 className="mb-4 text-base font-semibold text-white">Invite a person</h2>
        <InviteForm branches={activeBranches} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/80">
          Pending invites ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="glass-card px-5 py-8 text-center text-sm text-white/50">
            No pending invites.
          </div>
        ) : (
          pending.map((invite) => (
            <div
              key={invite.id}
              className="glass-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {invite.full_name || invite.email}
                </p>
                <p className="text-xs text-white/50">
                  {invite.email} · {ROLE_LABELS[invite.role] ?? invite.role} ·{" "}
                  {invite.branch_id
                    ? branchName.get(invite.branch_id) ?? "branch"
                    : "no branch"}
                  {invite.resend_count > 0
                    ? ` · resent ${invite.resend_count}x`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="pill-amber">Pending</span>
                <ActionForm
                  action={resendInviteAction}
                  hidden={{ invite_id: invite.id }}
                  label="Resend"
                  buttonClassName="btn-ghost px-3 py-1.5 text-xs"
                  className=""
                />
                <ActionForm
                  action={revokeInviteAction}
                  hidden={{ invite_id: invite.id }}
                  label="Revoke"
                  buttonClassName="btn-ghost px-3 py-1.5 text-xs"
                  className=""
                />
              </div>
            </div>
          ))
        )}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <UserDropdown
          title="Active users"
          subtitle="Admins, Managers and Supervisors: the people who run the service"
          users={activeUsers.map(toItem)}
          branches={branchOptions}
          emptyText="No Admins or Managers yet. Invite one above."
        />
        <UserDropdown
          title="Passive users"
          subtitle="Team Members: their own area only, and free of charge"
          users={passiveUsers.map(toItem)}
          branches={branchOptions}
          emptyText="No Team Member logins yet. They are created when a person is added with an email."
        />
      </div>
    </div>
  );
}

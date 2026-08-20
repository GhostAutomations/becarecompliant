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
import Link from "next/link";
import ActionForm from "@/components/action-form";
import { seatNotice } from "@/lib/billing/seat-notice";
import { includedSeatsForTier, EXTRA_SEAT_PENCE, isBillableSeat } from "@/lib/billing/seats";
import {
  addInviteDomain,
  removeInviteDomain,
  resendInviteAction,
  revokeInviteAction,
  sendHeldInvitesAction,
} from "../actions";
import { listInviteDomains, readInviteDomains } from "@/lib/invite-domains";

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
  const [{ data: branches }, { data: users }, { data: invites }, { data: company }] =
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
        .select("id, email, full_name, role, branch_id, last_sent_at, resend_count, email_sent_at")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("companies")
        .select("invite_email_domains, tier")
        .eq("id", companyId)
        .maybeSingle(),
    ]);

  /**
   * The optional invite email domain allowlist (0149). Empty means off, which is
   * how every company starts and how most small providers will stay.
   */
  const inviteDomains = readInviteDomains(company?.invite_email_domains).sort();

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
  // Created but never sent: the person does not know they have an account.
  const heldCount = pending.filter((i) => !i.email_sent_at).length;

  /* What the invitations already sent will cost when they are accepted. Seats are counted on
     ACTIVE users, so a pending invite is not a charge yet — the notice says so rather than
     pretending an invitation is a bill. */
  const activeBillable = (users ?? []).filter(
    (u) => u.status === "active" && isBillableSeat(u.role),
  ).length;
  const pendingBillable = pending.filter((i) => isBillableSeat(i.role)).length;
  const { data: billingRow } = await supabase
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  const notice = seatNotice({
    activeUsers: activeBillable,
    pendingInvites: pendingBillable,
    included: includedSeatsForTier((company?.tier as string) ?? "business"),
    extraSeatPence: EXTRA_SEAT_PENCE,
    hasSubscription: ["active", "trialing", "past_due"].includes(
      (billingRow as { subscription_status?: string | null } | null)?.subscription_status ?? "",
    ),
  });

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

      {/* SAID BEFORE THE INVITE, NOT AFTER THE INVOICE (Phil, 2026-08-20). Six office users were
          added to a four-user plan and nothing anywhere mentioned it: the figures lived on
          Settings > Billing and nowhere else. There is deliberately still no seat GATE — a
          compliance tool must never refuse to add the manager who has to sign things off. */}
      {notice.show ? (
        <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-4">
          <p className="text-sm text-gold-100">{notice.message}</p>
          <Link
            href="/settings/billing"
            className="mt-2 inline-block text-xs text-gold-300 hover:underline"
          >
            See your plan and billing
          </Link>
        </div>
      ) : null}

      <section className="glass-card p-6">
        <h2 className="text-base font-semibold text-white">Invite a person</h2>
        {inviteDomains.length > 0 ? (
          <p className="mt-1 text-xs text-white/50">
            Invites sent from this screen can only go to {listInviteDomains(inviteDomains)}.
            Team Member logins are not affected.
          </p>
        ) : null}
        <div className="mt-4">
          <InviteForm branches={activeBranches} />
        </div>
      </section>

      {/* The allowlist sits on this screen because this screen is where it takes
          effect, and nowhere else. See lib/invite-domains.ts and migration 0149. */}
      <section className="glass-card p-6">
        <h2 className="text-base font-semibold text-white">Allowed email domains</h2>
        <p className="mt-2 text-sm text-white/60">
          Optional. Leave this empty and any email address can be invited, which is
          how it works today. Add one or more domains and the invite form above will
          only send to an address ending in one of them, so a personal address or a
          typo is refused before the invitation goes out.
        </p>
        <p className="mt-2 text-sm text-white/60">
          It applies only to the invites you send from this screen. It is never
          applied to Team Member logins, which are created automatically when you
          add or import a person and keep using the email address on their Record,
          so switching this on cannot lock your care staff out. Subdomains count, so
          an address at mail.sunrisecare.co.uk is accepted when sunrisecare.co.uk is
          on the list.
        </p>

        <div className="mt-4 space-y-2">
          {inviteDomains.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">
              No domains set, so any email address can be invited.
            </p>
          ) : (
            inviteDomains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"
              >
                <span className="truncate text-sm text-white">@{domain}</span>
                <ActionForm
                  action={removeInviteDomain}
                  hidden={{ domain }}
                  label="Remove"
                  savedLabel="Removed"
                  buttonClassName="btn-ghost px-3 py-1.5 text-xs"
                  className=""
                />
              </div>
            ))
          )}
        </div>

        {/* Keyed on the current list so a successful add remounts the form and
            clears the box, rather than leaving the domain sitting in it. */}
        <div className="mt-4 max-w-sm">
          <ActionForm
            key={inviteDomains.join(",")}
            action={addInviteDomain}
            label="Add"
            savedLabel="Added"
            buttonClassName="btn-primary text-xs"
          >
            <div>
              <label htmlFor="invite_domain" className="form-label">
                Add a domain
              </label>
              <input
                id="invite_domain"
                name="domain"
                placeholder="sunrisecare.co.uk"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-white/45">
                Type it with or without the @. Capital letters do not matter.
              </p>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/80">
            Pending invites ({pending.length})
          </h2>
          {heldCount > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/60">
                {heldCount} {heldCount === 1 ? "invite has" : "invites have"} not been sent yet
              </span>
              {heldCount > 1 ? (
                <ActionForm
                  action={sendHeldInvitesAction}
                  label={`Send all ${heldCount}`}
                  savedLabel="Sent"
                  buttonClassName="btn-primary px-3 py-1.5 text-xs"
                  className=""
                  confirm={`Send the invitation email to all ${heldCount} people who are waiting? They will be able to sign in as soon as they set a password.`}
                />
              ) : null}
            </div>
          ) : null}
        </div>
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
                    ? ` · sent ${invite.resend_count}x`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* "Pending" and "Not sent yet" are different facts about an invitation and were
                    being told as one. Somebody chasing a manager who has not accepted needs to
                    know whether that manager was ever written to. */}
                {invite.email_sent_at ? (
                  <span className="pill-amber">Pending</span>
                ) : (
                  <span className="pill pill-neutral">Not sent yet</span>
                )}
                <ActionForm
                  action={resendInviteAction}
                  hidden={{ invite_id: invite.id }}
                  label={invite.email_sent_at ? "Resend" : "Send invite"}
                  savedLabel="Sent"
                  buttonClassName={
                    invite.email_sent_at
                      ? "btn-ghost px-3 py-1.5 text-xs"
                      : "btn-primary px-3 py-1.5 text-xs"
                  }
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

      {/* Two dropdowns side by side, each half the width of the tiles above. */}
      <div className="grid gap-4 sm:grid-cols-2">
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

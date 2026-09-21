import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { branchSummary } from "@/lib/auth/manage-scope";
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
import SettingsSection from "@/components/settings/settings-section";
import { MODULES, isLocked, disabledKey } from "@/lib/auth/module-catalogue";
import { companyRoles, disabledModules } from "@/lib/auth/module-access";
import { COPYABLE_ROLES, displayRoleLabel, roleChoiceValue } from "@/lib/auth/custom-roles";
import { isCompanyWideRole } from "@/lib/people/roles";
import RoleAccessTile from "@/components/settings/role-access-tile";
import NewRoleForm from "@/components/settings/new-role-form";
import PortalFormsTile from "@/components/settings/portal-forms-tile";
import { PORTAL_FORMS, portalFormKey } from "@/lib/auth/portal-forms";

export const metadata: Metadata = { title: "Roles, users and access" };

/**
 * ONE SCREEN, FOLDED (Phil, 2026-09-21): "i think we should join those 2 settings together and
 * lets have things minimised inside so its not all open and messy."
 *
 * Users and invites and User access were two tiles asking the same question from two directions:
 * who is in the company, and what their role opens. They are one page now, every section closed
 * until it is wanted, with the count on the heading so a section says what is in it unopened.
 *
 * A ROLE WITH NOTHING TO OFFER IS NOT SHOWN in Role access: the filter drops any role the
 * catalogue never names, so a tile of nothing but greyed boxes cannot appear and invite somebody
 * to try.
 */
const ROLE_ORDER = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
  "on_call",
  "team_member",
];

function roleRank(role: string): number {
  return [
    "company_admin",
    "registered_individual",
    "registered_manager",
    "manager",
    "supervisor",
    "recruiter",
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
  const disabled = await disabledModules(companyId);
  const ownRoles = await companyRoles(companyId);
  const accessRoles = ROLE_ORDER.filter((role) => MODULES.some((m) => m.roles.includes(role)));
  const [{ data: branches }, { data: users }, { data: invites }, { data: company }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, kind, status")
        .eq("company_id", companyId)
        .order("kind", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, status, company_role_id")
        .eq("company_id", companyId)
        .neq("role", "platform_admin"),
      supabase
        .from("invites")
        .select("id, email, full_name, role, company_role_id, branch_id, last_sent_at, resend_count, email_sent_at")
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

  /* A company's own roles (0314): the name to show beside a person, and how many are on each,
     which is what the delete refusal counts. */
  const ownRoleById = new Map(ownRoles.map((r) => [r.id, r]));
  const peopleOnRole = new Map<string, number>();
  for (const u of (users ?? []) as Array<{ company_role_id?: string | null }>) {
    if (u.company_role_id) {
      peopleOnRole.set(u.company_role_id, (peopleOnRole.get(u.company_role_id) ?? 0) + 1);
    }
  }
  function roleNameFor(role: string, companyRoleId: string | null | undefined): string {
    return displayRoleLabel(
      ROLE_LABELS[role] ?? role,
      companyRoleId ? ownRoleById.get(companyRoleId)?.name ?? null : null,
    );
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

  /* A PENDING INVITE ALREADY HAS ITS BRANCHES. The profile is created and promoted when
     the invite is sent (lib/invites.ts), and an "All branches" invite writes a
     user_branches row for every active branch while leaving invites.branch_id null. The
     list printed that null as "no branch", so all and none looked identical. Read the
     rows instead, keyed by email because that is what the two tables share. */
  const profileByEmail = new Map(
    (users ?? []).map((u) => [String(u.email).toLowerCase(), u]),
  );
  function branchNamesForUser(userId: string): string[] {
    const primaryId = primaryByUser.get(userId) ?? null;
    return [
      primaryId ? branchName.get(primaryId) : null,
      ...(additionalByUser.get(userId) ?? []).map((id) => branchName.get(id)),
    ].filter(Boolean) as string[];
  }
  function inviteBranchSummary(invite: { email: string; role: string; branch_id: string | null }): string {
    const linked = profileByEmail.get(String(invite.email).toLowerCase());
    const names = linked
      ? branchNamesForUser(linked.id)
      : ((invite.branch_id ? [branchName.get(invite.branch_id)] : []).filter(Boolean) as string[]);
    return branchSummary({
      role: invite.role,
      branchNames: names,
      activeBranchCount: activeBranches.length,
    });
  }

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
    company_role_id?: string | null;
  }): UserListItem {
    const isSelf = u.id === user.id;
    const isAdmin = u.role === "company_admin";
    const primaryId = primaryByUser.get(u.id) ?? null;
    const additionalIds = additionalByUser.get(u.id) ?? [];
    const branchNames = branchNamesForUser(u.id);
    return {
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      /* The value the role picker posts: their company's own role travels as "custom:<id>", so
         one field carries either kind and the two can never disagree (lib/auth/custom-roles). */
      role: roleChoiceValue(u.role, u.company_role_id ?? null),
      roleLabel: roleNameFor(u.role, u.company_role_id),
      status: u.status,
      isSelf,
      canManage: !isSelf && !isAdmin,
      primaryBranchId: primaryId,
      additionalBranchIds: additionalIds,
      /* ONE RULE, shared with the pending invites below and transcribed from the RLS
         policy (lib/auth/manage-scope.ts). This said "All branches" for the Admin only,
         so a Responsible Individual and a Registered Manager - company wide in the
         policy - read "No branch" while seeing everything. */
      branchSummary: branchSummary({
        role: u.role,
        branchNames,
        activeBranchCount: activeBranches.length,
      }),
    };
  }

  /* What a new role may start from, with its reach said in words rather than implied: somebody
     naming a role needs to know before they choose that the reach comes from the role underneath
     and not from anything on this screen. */
  const copyableRoles = COPYABLE_ROLES.map((value) => ({
    value,
    label: ROLE_LABELS[value] ?? value,
    reach: isCompanyWideRole(value)
      ? "every branch in the company."
      : "only the branches each person on it is assigned to.",
  }));

  /* Every role picker on this screen is built from ONE list: the built-in roles, then the ones
     this company has made. One list, so an invite and a role change cannot offer different
     answers to the same question, and a role added later appears in both at once.

     A company's own role is shown with the role it copies in brackets, because that is what
     decides its branch reach and an Admin choosing between "Care Coordinator" and "Supervisor"
     is entitled to know they are the same thing underneath.

     NOT company_admin: only the Founder creates those. */
  const roleOptions = [
    ...ROLE_ORDER.filter((r) => r !== "company_admin").map((value) => ({
      value,
      label: ROLE_LABELS[value] ?? value,
      baseRole: value,
    })),
    { value: "staff", label: ROLE_LABELS.staff ?? "Team Member", baseRole: "staff" },
    ...ownRoles.map((r) => ({
      value: roleChoiceValue(r.baseRole, r.id),
      label: `${r.name} (${ROLE_LABELS[r.baseRole] ?? r.baseRole})`,
      baseRole: r.baseRole,
    })),
  ];
  /* An INVITE does not offer the carer login: a Team Member account is created from the People
     register when a carer is added with an email (lib/staff/invite.ts), not typed in here. */
  const inviteRoleOptions = roleOptions.filter((o) => o.value !== "staff");

  return (
    <div className="page-shell space-y-4">
      {/* Live refresh: the pending and team lists update the instant an invite is
          accepted or a user changes, no manual refresh. RLS scopes events. */}
      <RealtimeRefresh tables={["invites", "profiles"]} channel="users-live" />
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Roles, users and access</h1>
        <p className="page-subtitle">
          The roles your company uses, who is on them, what each one opens, and what a carer sees
          in the team portal. Only Admins can make a role, invite somebody, change a role or
          change what a role reaches.
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

      {/*
        ROLES OF YOUR OWN (Phil, 2026-09-21: "lets add the roles to users and access, called that
        setting tile Roles, users and access").

        A role a company makes is a NAMED NARROWING of a built-in one: it keeps the built-in
        role's branch reach and everything the database lets that role do, and unticks
        departments it must not open. That is why it can never reach further than the role it
        starts from, and why no policy had to change to allow it — the person still carries the
        built-in role underneath, which is what every rule reads.

        It is the first section on the page on purpose: a role has to exist before somebody can
        be invited onto it.
      */}
      <SettingsSection
        title="Roles"
        summary="Roles your company has made: a built-in role, renamed, with departments taken off."
        count={ownRoles.length}
      >
        <div className="space-y-5">
          <NewRoleForm roles={copyableRoles} />
          {ownRoles.length > 0 ? (
            <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ownRoles.map((r) => (
                <RoleAccessTile
                  key={r.id}
                  role={r.baseRole}
                  roleLabel={r.name}
                  companyRole={{
                    id: r.id,
                    baseLabel: ROLE_LABELS[r.baseRole] ?? r.baseRole,
                    people: peopleOnRole.get(r.id) ?? 0,
                  }}
                  modules={MODULES.map((m) => ({
                    key: m.key,
                    label: m.label,
                    note: m.note ?? null,
                    allowed: m.roles.includes(r.baseRole),
                    locked: isLocked(m.key, r.baseRole),
                    on:
                      m.roles.includes(r.baseRole) &&
                      !disabled.has(disabledKey(r.baseRole, m.key)) &&
                      !r.off.includes(m.key),
                  }))}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">
              You have not made any roles yet. Everyone is on one of the built-in roles below.
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Invite a person"
        summary="Send an invitation, with their role and branches."
      >
        {inviteDomains.length > 0 ? (
          <p className="mt-1 text-xs text-white/50">
            Invites sent from this screen can only go to {listInviteDomains(inviteDomains)}.
            Team Member logins are not affected.
          </p>
        ) : null}
        <div className="mt-4">
          <InviteForm branches={activeBranches} roleOptions={inviteRoleOptions} />
        </div>
      </SettingsSection>

      {/* The allowlist sits on this screen because this screen is where it takes
          effect, and nowhere else. See lib/invite-domains.ts and migration 0149. */}
      <SettingsSection
        title="Allowed email domains"
        summary="Optional. Restrict who the invites above can be sent to."
        count={inviteDomains.length > 0 ? inviteDomains.length : null}
      >
        <p className="text-sm text-white/60">
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
      </SettingsSection>

      <SettingsSection
        title="Pending invites"
        summary="People invited who have not signed in yet."
        count={pending.length}
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          <p className="py-2 text-sm text-white/50">No pending invites.</p>
        ) : (
          <div className="mt-3 space-y-3">{pending.map((invite) => (
            <div
              key={invite.id}
              className="glass-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {invite.full_name || invite.email}
                </p>
                <p className="text-xs text-white/50">
                  {invite.email} · {roleNameFor(invite.role, invite.company_role_id)} ·{" "}
                  {inviteBranchSummary(invite)}
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
          ))}</div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Active users"
        summary="Admins, Managers, Supervisors and Recruiters: the people who run the service."
        count={activeUsers.length}
      >
        <UserDropdown
          title="Active users"
          subtitle="Admins, Managers and Supervisors: the people who run the service"
          users={activeUsers.map(toItem)}
          branches={branchOptions}
          roleOptions={roleOptions}
          emptyText="No Admins or Managers yet. Invite one above."
        />
      </SettingsSection>

      <SettingsSection
        title="Team Member logins"
        summary="Carers: their own area only, and free of charge."
        count={passiveUsers.length}
      >
        <UserDropdown
          title="Passive users"
          subtitle="Team Members: their own area only, and free of charge"
          users={passiveUsers.map(toItem)}
          branches={branchOptions}
          roleOptions={roleOptions}
          emptyText="No Team Member logins yet. They are created when a person is added with an email."
        />
      </SettingsSection>

      {/*
        WAS ITS OWN SCREEN (Settings, User access) until 2026-09-21. It answers the other half of
        the same question and belongs beside the people it applies to.

        A greyed tick is one that role can never have, with the reason beside it: those are fixed
        by the product, because a setting must not hand somebody a department the rest of the
        system would refuse them anyway. And this is about DEPARTMENTS, not records -- a
        Supervisor with Complaints ticked still sees only her own branches.
      */}
      <SettingsSection
        title="Role access"
        summary="Which departments each role opens. Untick one and it leaves that role's menu."
        count={accessRoles.length}
      >
        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accessRoles.map((role) => (
            <RoleAccessTile
              key={role}
              role={role}
              roleLabel={ROLE_LABELS[role] ?? role}
              modules={MODULES.map((m) => ({
                key: m.key,
                label: m.label,
                note: m.note ?? null,
                allowed: m.roles.includes(role),
                locked: isLocked(m.key, role),
                on: m.roles.includes(role) && !disabled.has(disabledKey(role, m.key)),
              }))}
            />
          ))}
        </div>
      </SettingsSection>

      {/* A carer's portal is a short list of things they may fill in, not fifteen greyed
          departments and one tick (Phil, 2026-09-17). */}
      <SettingsSection
        title="Team portal forms"
        summary="What a carer can open and fill in from their own area."
      >
        <div className="max-w-md">
          <PortalFormsTile
            portalOn={!disabled.has("staff|team_portal")}
            forms={PORTAL_FORMS}
            onByKey={Object.fromEntries(
              PORTAL_FORMS.map((f) => [f.key, !disabled.has(`staff|${portalFormKey(f.key)}`)]),
            )}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

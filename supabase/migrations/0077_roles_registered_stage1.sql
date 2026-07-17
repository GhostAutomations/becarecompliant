-- 0077_roles_registered_stage1
-- Roles overhaul, Stage 1 (foundation). Adds two all-branch senior roles:
--   registered_individual, registered_manager — see all branches and everything a
--   Branch Manager can, but NOT Settings or Billing (those stay company_admin only).
-- Implemented by a new is_company_wide() helper wired into the existing branch checks,
-- so every data policy that already grants a Branch Manager / Admin now also grants the
-- Registered roles for ALL branches, with no per-policy rewrites. Manager (relabelled
-- "Branch Manager" in the UI) and team_member (relabelled "Viewer") keep their enum
-- values. Supervisor branch-expansion, holiday-approval limits and Viewer read-only
-- come in later stages. Applied to ref bgrtcvyjuwopunpnudeu only.

-- Allow the new roles to be invited.
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role = any (array[
    'company_admin', 'registered_individual', 'registered_manager',
    'manager', 'supervisor', 'team_member'
  ]));

-- All-branch senior roles: Admin + the two Registered roles.
create or replace function public.is_company_wide(cid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.role in ('company_admin', 'registered_individual', 'registered_manager')
      and p.status = 'active'
  );
$$;

-- Branch read: assigned to the branch, OR a company-wide senior role (all branches), OR Founder.
create or replace function public.is_branch_member(bid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select
    exists (select 1 from public.user_branches ub where ub.user_id = auth.uid() and ub.branch_id = bid)
    or exists (
      select 1 from public.branches b
      where b.id = bid and (public.is_company_wide(b.company_id) or public.is_platform_admin())
    );
$$;

-- Branch manager authority (writes + approvals + complaints): a Manager assigned to the
-- branch, OR a company-wide senior role (all branches), OR Founder. Supervisor is NOT here.
create or replace function public.is_branch_manager(bid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select
    exists (
      select 1 from public.profiles p
      join public.user_branches ub on ub.user_id = p.id
      where p.id = auth.uid() and p.role = 'manager' and p.status = 'active' and ub.branch_id = bid
    )
    or exists (
      select 1 from public.branches b
      where b.id = bid and (public.is_company_wide(b.company_id) or public.is_platform_admin())
    );
$$;

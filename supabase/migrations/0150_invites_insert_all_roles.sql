-- 0150_invites_insert_all_roles
-- FOUND BY PHIL 2026-07-29 while testing the invite email allowlist: inviting certain
-- roles failed with "new row violates row-level security policy for table invites".
-- Nothing to do with the allowlist, which had already passed; the insert itself was
-- refused.
--
-- Cause: the roles overhaul (0077-0081) added Registered Individual and Registered
-- Manager, and On Call arrived with the On Call department, and all of them were added
-- to invites_role_check, to INVITABLE_ROLES and to the invite form. But invites_insert
-- still listed only manager, supervisor, team_member and staff, so a Company Admin
-- could not invite a Registered role, another Company Admin, or an On Call user at all.
-- Company Admin was never in the list either, so an Admin could never invite a peer.
--
-- This is the SAME oversight as 0081 (profiles_role_check missed by 0077): when a role
-- is added, FOUR places need it, and the RLS insert policy is a fifth that was missed
-- both times. Adding a role means: DB check constraints, THIS policy, `Role` in
-- lib/nav, `InviteRole`, and the `Profile` union.
--
-- The branch manager clause is unchanged: a Branch Manager may still invite a Team
-- Member (`staff`) to their own branch and nothing else.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (
    is_platform_admin()
    or (
      is_company_admin(company_id)
      and role = any (array[
        'company_admin',
        'registered_individual',
        'registered_manager',
        'manager',
        'supervisor',
        'on_call',
        'team_member',
        'staff'
      ])
    )
    or (role = 'staff' and branch_id is not null and is_branch_manager(branch_id))
  );

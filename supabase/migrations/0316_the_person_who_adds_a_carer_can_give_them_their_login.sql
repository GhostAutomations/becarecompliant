-- 0316_the_person_who_adds_a_carer_can_give_them_their_login
--
-- Phil, 2026-09-21, of a carer added that morning: "fix the below, we are not sending logins
-- yet." The audit row for that add says exactly what happened:
--
--   "staff_invite": { "ok": false, "error": "new row violates row-level security policy for
--                     table \"invites\"" }
--
-- Hayley is a Supervisor. She added the carer, which 0309 and 0311 allow. Adding somebody with
-- an email also creates their Team Member login, and invites_insert let a BRANCH MANAGER write
-- a staff invite but not a Supervisor. So the auth account was created, the invites row was
-- refused, and what was left was an account belonging to no company, a carer with no login, and
-- nothing on the screen to say so. The fifth of this shape (DEF-023, 028, 031, 032).
--
-- A STAFF LOGIN IS NOT AN INVITE TO RUN THE SERVICE, and that distinction is the whole of this
-- change. role = 'staff' is a carer's own area: their training, their checks, raising a concern.
-- It is created automatically as part of adding a person, by whoever is allowed to add that
-- person, and is free of charge. Inviting a Manager or a Supervisor -- somebody who reads other
-- people's records -- stays with Company Admins, on the Settings screen, exactly as before.
--
-- AND THE RECRUITER WAS NEVER ADDED to the Admin's list when the role was created (0310), so
-- Settings offered "Recruiter" in the invite dropdown and the database refused it. Found while
-- reading this policy for the fault above. Same defect, one line away from it.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert with check (
  is_platform_admin()
  or (
    is_company_admin(company_id)
    and role = any (array[
      'company_admin', 'registered_individual', 'registered_manager', 'manager',
      'supervisor', 'recruiter', 'on_call', 'team_member', 'staff'
    ])
  )
  -- A carer's own login, by whoever may add that carer in that branch.
  or (role = 'staff' and branch_id is not null and is_branch_lead(branch_id))
);

-- 0081 Allow the two new Registered roles on profiles.role.
-- Migration 0077 updated invites_role_check but NOT profiles_role_check, so a user
-- accepting a Registered invite (which writes the role onto their profile) would fail
-- the check constraint. This adds registered_individual + registered_manager.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'platform_admin','company_admin',
    'registered_individual','registered_manager',
    'manager','supervisor','team_member'
  ));

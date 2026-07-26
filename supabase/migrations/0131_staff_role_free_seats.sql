-- 0131_staff_role_free_seats.sql
-- Team Members get their own logins (Phil, 2026-07-26, reversing the no-account
-- decision). Three things have to be true before that is safe:
--
--  1. A NEW ROLE. The existing 'team_member' role is the read-only Viewer, which
--     reads every Person and every Service User: far too much for a carer. The
--     new role is keyed 'staff' and shown in the product as "Team Member".
--  2. FREE SEATS. company_active_user_count counts every active profile, and Pro
--     includes 6 seats then charges £5 each. A 60 carer agency would be £270 a
--     month of staff logins. Staff are excluded from the seat count entirely.
--  3. A NARROW VIEW. A staff login sees only what Phil specified: forms and
--     policies assigned to them, forms they have submitted, and their own
--     holidays. Notably NOT everything filed on their record: absence meeting
--     minutes and probation reviews live there, so the existing own-record
--     Evidence clause is switched off for staff, who keep their own submissions
--     through author_id.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'platform_admin', 'company_admin', 'registered_individual', 'registered_manager',
    'manager', 'supervisor', 'team_member', 'on_call', 'staff'
  ));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in (
    'company_admin', 'registered_individual', 'registered_manager',
    'manager', 'supervisor', 'team_member', 'on_call', 'staff'
  ));

-- Is the caller a staff (Team Member) login?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'staff' and p.status = 'active'
  );
$$;

-- Staff invites are created automatically when a Person is added with an email,
-- so a Branch Manager (who can add people) must be able to create one. They can
-- create ONLY staff invites, and only into a branch they manage.
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (
    public.is_platform_admin()
    or (
      public.is_company_admin(company_id)
      and role = any (array['manager', 'supervisor', 'team_member', 'staff'])
    )
    or (
      role = 'staff'
      and branch_id is not null
      and public.is_branch_manager(branch_id)
    )
  );

-- Staff logins are free: they are not the people who run the service.
create or replace function public.company_active_user_count(cid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when public.is_company_member(cid) or public.is_platform_admin() then (
      select count(*)::int from public.profiles p
      where p.company_id = cid
        and p.status = 'active'
        and p.role <> 'platform_admin'
        and p.role <> 'staff'
    )
    else null
  end;
$$;

-- Evidence: staff keep their OWN submissions (author_id) but do not gain the
-- whole of their record, which can hold absence meeting minutes and probation
-- reviews. Every other clause is unchanged.
drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (author_id = auth.uid())
    or (record_type = 'complaint' and public.is_company_on_call(company_id))
    or (
      record_type = 'person' and record_id is not null and (
        public.is_person_supervisor(record_id)
        or (
          not public.is_staff()
          and exists (
            select 1 from public.people pe
            where pe.id = evidence.record_id and pe.profile_id = auth.uid()
          )
        )
      )
    )
    or (
      record_type = 'service_user' and record_id is not null
      and public.is_service_user_supervisor(record_id)
    )
  );

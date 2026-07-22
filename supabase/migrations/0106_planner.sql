-- 0106_planner
-- Additions: the Planner department. Book compliance tasks (any People or Service
-- User check) or ad-hoc entries against a date/time and a CONDUCTOR (the staff
-- member who will carry it out). Bookings surface on the conductor's personal
-- planner, on the branch "whiteboard" (month calendar), and on the subject's
-- record. A booking linked to a check_instance is marked completed automatically
-- when that check is completed (wired in a later slice).
--
-- Pro-and-above feature (gated in the app via lib/billing/tier.ts). Branch scoped.
-- Visibility mirrors the registers: a Branch Manager or Supervisor sees their own
-- branch, company-wide roles (Registered Individual/Manager) and Admins see all
-- branches, and a conductor always sees their own bookings. Writes are Manager+
-- and Supervisor (who book their own). Applied to ref bgrtcvyjuwopunpnudeu ONLY.

-- Branch-scoped supervisor check (Supervisor assigned to the branch, active). The
-- existing is_person_supervisor / is_service_user_supervisor are per-record; the
-- Planner needs a branch-level one for booking rows that may be ad-hoc (no subject).
create or replace function public.is_branch_supervisor(bid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1
    from public.user_branches ub
    join public.profiles pr on pr.id = auth.uid()
    where ub.user_id = auth.uid()
      and ub.branch_id = bid
      and pr.role = 'supervisor'
      and pr.status = 'active'
  );
$$;

create table if not exists public.planner_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  -- Subject of the task (optional: ad-hoc bookings have no subject).
  population text check (population in ('people', 'service_users')),
  subject_person_id uuid references public.people(id) on delete cascade,
  subject_service_user_id uuid references public.service_users(id) on delete cascade,
  -- Link to the check this booking schedules; null for ad-hoc bookings.
  check_instance_id uuid references public.check_instances(id) on delete set null,
  check_kind text,                 -- denormalised check kind/label, or null for ad-hoc
  title text,                      -- ad-hoc title, or an override label
  -- Whose planner this lands on: the person who conducts the task.
  conductor_profile_id uuid not null references public.profiles(id) on delete restrict,
  scheduled_date date not null,
  start_time time,                 -- optional time of day
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- A booking must describe something: a subject-linked task or an ad-hoc title.
  constraint planner_bookings_describes_ck check (
    subject_person_id is not null
    or subject_service_user_id is not null
    or (title is not null and length(btrim(title)) > 0)
  ),
  -- Population / subject coherence.
  constraint planner_bookings_subject_ck check (
    (population = 'people' and subject_person_id is not null and subject_service_user_id is null)
    or (population = 'service_users' and subject_service_user_id is not null and subject_person_id is null)
    or (population is null and subject_person_id is null and subject_service_user_id is null)
  )
);

create index planner_bookings_company_idx on public.planner_bookings (company_id, status);
create index planner_bookings_branch_date_idx on public.planner_bookings (branch_id, scheduled_date);
create index planner_bookings_conductor_idx on public.planner_bookings (conductor_profile_id, scheduled_date);
create index planner_bookings_instance_idx on public.planner_bookings (check_instance_id);
create index planner_bookings_person_idx on public.planner_bookings (subject_person_id);
create index planner_bookings_su_idx on public.planner_bookings (subject_service_user_id);

alter table public.planner_bookings enable row level security;

-- Realtime: RLS tables need REPLICA IDENTITY FULL for UPDATE/DELETE events to
-- reach subscribers (subscribe unfiltered; RLS scopes the events).
alter table public.planner_bookings replica identity full;
alter publication supabase_realtime add table public.planner_bookings;

-- Read: any branch member (Manager/Supervisor assigned, company-wide, Founder),
-- plus the conductor always sees their own bookings.
create policy planner_bookings_select on public.planner_bookings
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_branch_member(branch_id)
    or conductor_profile_id = auth.uid()
  );

-- Write: Admins, company-wide roles, Branch Managers and branch Supervisors.
create policy planner_bookings_insert on public.planner_bookings
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
  );

create policy planner_bookings_update on public.planner_bookings
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
  );

create policy planner_bookings_delete on public.planner_bookings
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
  );

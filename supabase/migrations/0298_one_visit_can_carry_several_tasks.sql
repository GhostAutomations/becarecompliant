-- 0298_one_visit_can_carry_several_tasks
--
-- Phil, 2026-09-18: "booking isnt editable and you can only add one task, if they are at a
-- house they may want to complete 2 or 3 tasks in one visit."
--
-- One task per booking was in the TABLE, not just in the form: planner_bookings carried a
-- single check_instance_id. So a supervision and a spot check at the same address were two
-- bookings at the same minute, which the clash rule refuses outright (0180: nobody is
-- visited twice at once). The only way to do two jobs at one house was to lie about the time.
--
-- A booking is a VISIT now, and the jobs on it live here. What that buys, beyond the obvious:
--   - the visit is ONE appointment -- one chip on the whiteboard, one event in somebody's
--     Outlook -- rather than three trips to one address;
--   - each job closes on its own when its Check is completed, and the visit closes only when
--     every job on it has (Phil chose this over "the first one closes it": a visit that reads
--     as done with two of its three jobs never carried out is worse than no status at all);
--   - the job list is editable, so a visit can gain or lose work without being cancelled and
--     retyped, and a job already completed keeps its status when the list is re-saved.
--
-- RLS: a job is readable and writable exactly when its VISIT is. The two helpers below are
-- the transcription of planner_bookings' own policies, in one place, rather than the same
-- predicate copied into four policies where it can drift.
--
-- planner_bookings.check_instance_id, tracker_form_key and check_kind are SUPERSEDED by this
-- table and are no longer read or written by any code. They are left in place for this
-- migration so a deploy can cross over safely, and dropped once it has.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.planner_booking_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.planner_bookings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  check_instance_id uuid references public.check_instances(id) on delete cascade,
  tracker_form_key text,
  check_kind text,
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  completed_at timestamptz,
  position smallint not null default 1,
  created_at timestamptz not null default now(),
  -- A job is a Check OR a tracker form, never both and never neither. A visit with no jobs
  -- on it at all is the ad-hoc case, and that is a booking with no rows here.
  constraint planner_booking_tasks_one_target check (
    (check_instance_id is not null and tracker_form_key is null)
    or (check_instance_id is null and tracker_form_key is not null)
  )
);

-- The same job cannot be put on one visit twice.
create unique index if not exists planner_booking_tasks_check_once
  on public.planner_booking_tasks (booking_id, check_instance_id)
  where check_instance_id is not null;
create unique index if not exists planner_booking_tasks_tracker_once
  on public.planner_booking_tasks (booking_id, tracker_form_key)
  where tracker_form_key is not null;
create index if not exists planner_booking_tasks_booking on public.planner_booking_tasks (booking_id);
create index if not exists planner_booking_tasks_instance on public.planner_booking_tasks (check_instance_id);

create or replace function public.can_read_planner_booking(p_booking_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists (
    select 1 from public.planner_bookings b
    where b.id = p_booking_id
      and (public.is_platform_admin()
           or public.is_branch_member(b.branch_id)
           or b.conductor_profile_id = auth.uid()
           or b.created_by = auth.uid())
  );
$$;

create or replace function public.can_write_planner_booking(p_booking_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists (
    select 1 from public.planner_bookings b
    where b.id = p_booking_id
      and (public.is_platform_admin()
           or public.is_company_admin(b.company_id)
           or public.is_branch_manager(b.branch_id)
           or public.is_branch_supervisor(b.branch_id)
           or b.conductor_profile_id = auth.uid()
           or b.created_by = auth.uid())
  );
$$;

alter table public.planner_booking_tasks enable row level security;

create policy planner_booking_tasks_select on public.planner_booking_tasks
  for select to authenticated using (public.can_read_planner_booking(booking_id));
create policy planner_booking_tasks_insert on public.planner_booking_tasks
  for insert to authenticated with check (public.can_write_planner_booking(booking_id));
create policy planner_booking_tasks_update on public.planner_booking_tasks
  for update to authenticated using (public.can_write_planner_booking(booking_id))
  with check (public.can_write_planner_booking(booking_id));
create policy planner_booking_tasks_delete on public.planner_booking_tasks
  for delete to authenticated using (public.can_write_planner_booking(booking_id));

-- Every booking that already exists becomes a visit with one job on it, carrying the
-- booking's own status so nothing that was done reads as outstanding in the morning.
insert into public.planner_booking_tasks
  (booking_id, company_id, check_instance_id, tracker_form_key, check_kind, status, completed_at, position)
select b.id, b.company_id, b.check_instance_id, b.tracker_form_key, b.check_kind,
       case when b.status = 'completed' then 'completed'
            when b.status = 'cancelled' then 'cancelled'
            else 'planned' end,
       case when b.status = 'completed' then b.updated_at else null end,
       1
from public.planner_bookings b
where (b.check_instance_id is not null or b.tracker_form_key is not null)
  and not exists (select 1 from public.planner_booking_tasks t where t.booking_id = b.id);

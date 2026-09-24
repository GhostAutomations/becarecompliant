-- Absence discounting (Operation Thistle, Phil 2026-09-24: "we need a away to reset abences or
-- restart triggers is some are discounted").
--
-- Three things a Manager or above can do, all kept on the record and all undoable:
--   1. Discount one absence. It stays on the record, struck through, with who, when and why, and
--      it stops counting towards occasions, days, the Bradford score and the stage triggers.
--   2. Restart the count from a date. Absences before that date stop counting, and so do meetings
--      held before it, so the person starts again from nothing at the stage they were at: none.
--      One active restart per person; setting a new one replaces it, clearing it undoes it.
--   3. After recording a meeting, tick the absences it discounted (the app calls 1 for each).
--
-- Who: Company Admin, the Registered roles and a Manager of the person's branch (Phil: "Managers
-- and above"). Supervisors can update absence_events under RLS for the last date, so the discount
-- columns are guarded by a trigger and can only be changed through these functions.

-- ---------------------------------------------------------------- 1. discount columns
alter table public.absence_events
  add column if not exists discounted_at timestamptz,
  add column if not exists discounted_by uuid references auth.users(id) on delete set null,
  add column if not exists discounted_by_name text,
  add column if not exists discount_reason text;

create or replace function public.absence_events_guard_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The service role (no signed in user) is trusted: retention and anonymisation run there.
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('bcc.absence_discount', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.discounted_at is not null or new.discounted_by is not null
       or new.discounted_by_name is not null or new.discount_reason is not null then
      raise exception 'An absence is discounted with Discount, after it has been recorded.';
    end if;
  elsif (new.discounted_at, new.discounted_by, new.discounted_by_name, new.discount_reason)
        is distinct from (old.discounted_at, old.discounted_by, old.discounted_by_name, old.discount_reason) then
    raise exception 'An absence is discounted or counted again with Discount, not edited directly.';
  end if;
  return new;
end;
$$;

drop trigger if exists absence_events_guard_discount on public.absence_events;
create trigger absence_events_guard_discount
  before insert or update on public.absence_events
  for each row execute function public.absence_events_guard_discount();

-- ---------------------------------------------------------------- 2. count restarts
create table if not exists public.absence_count_restarts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  from_date date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  set_by uuid references auth.users(id) on delete set null,
  set_by_name text,
  set_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null,
  cleared_by_name text
);
create unique index if not exists absence_count_restarts_one_active
  on public.absence_count_restarts (person_id) where cleared_at is null;
create index if not exists absence_count_restarts_company on public.absence_count_restarts (company_id);

alter table public.absence_count_restarts enable row level security;
revoke all on public.absence_count_restarts from anon;
revoke insert, update, delete, truncate on public.absence_count_restarts from authenticated;
grant select on public.absence_count_restarts to authenticated;

-- Read by whoever can read the person's absences (mirrors absence_events_select, 0312).
drop policy if exists absence_count_restarts_select on public.absence_count_restarts;
create policy absence_count_restarts_select on public.absence_count_restarts for select using (
  public.is_platform_admin()
  or public.is_company_admin(company_id)
  or exists (select 1 from public.people pe
             where pe.id = absence_count_restarts.person_id
               and pe.branch_id is not null and public.is_branch_lead(pe.branch_id))
  or public.is_person_supervisor(person_id)
  or public.is_company_on_call(company_id)
  or exists (select 1 from public.people pe
             where pe.id = absence_count_restarts.person_id and pe.profile_id = auth.uid())
);

-- ---------------------------------------------------------------- 3. who may discount
create or replace function public.can_discount_absence(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person
      and ( public.is_company_admin(pe.company_id)
         or public.is_company_wide(pe.company_id)
         or (pe.branch_id is not null and public.is_branch_manager(pe.branch_id)) )
  );
$$;
revoke all on function public.can_discount_absence(uuid) from public, anon;
grant execute on function public.can_discount_absence(uuid) to authenticated;

create or replace function public.absence_actor_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email)
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.absence_actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. the functions
create or replace function public.discount_absence(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.absence_events%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_row from public.absence_events where id = p_id;
  if not found then raise exception 'That absence could not be found.'; end if;
  if not public.can_discount_absence(v_row.person_id) then
    raise exception 'Only a Manager or above can discount an absence.';
  end if;
  if v_row.discounted_at is not null then return; end if;  -- already discounted: nothing to do
  if char_length(v_reason) < 3 then raise exception 'Say why this absence is being discounted.'; end if;

  perform set_config('bcc.absence_discount', 'on', true);
  update public.absence_events
     set discounted_at = now(), discounted_by = auth.uid(),
         discounted_by_name = public.absence_actor_name(), discount_reason = left(v_reason, 500)
   where id = p_id;
  perform set_config('bcc.absence_discount', '', true);
end;
$$;
revoke all on function public.discount_absence(uuid, text) from public, anon;
grant execute on function public.discount_absence(uuid, text) to authenticated;

create or replace function public.restore_absence(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.absence_events%rowtype;
begin
  select * into v_row from public.absence_events where id = p_id;
  if not found then raise exception 'That absence could not be found.'; end if;
  if not public.can_discount_absence(v_row.person_id) then
    raise exception 'Only a Manager or above can count an absence again.';
  end if;
  if v_row.discounted_at is null then return; end if;

  perform set_config('bcc.absence_discount', 'on', true);
  update public.absence_events
     set discounted_at = null, discounted_by = null, discounted_by_name = null, discount_reason = null
   where id = p_id;
  perform set_config('bcc.absence_discount', '', true);
end;
$$;
revoke all on function public.restore_absence(uuid) from public, anon;
grant execute on function public.restore_absence(uuid) to authenticated;

create or replace function public.restart_absence_count(p_person uuid, p_from date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_active public.absence_count_restarts%rowtype;
  v_id uuid;
begin
  select company_id into v_company from public.people where id = p_person;
  if v_company is null then raise exception 'That record could not be found.'; end if;
  if not public.can_discount_absence(p_person) then
    raise exception 'Only a Manager or above can restart the absence count.';
  end if;
  if p_from is null then raise exception 'Choose the date the count restarts from.'; end if;
  if p_from > (now() at time zone 'Europe/London')::date then
    raise exception 'The count can only restart from today or an earlier date.';
  end if;
  if char_length(v_reason) < 3 then raise exception 'Say why the count is being restarted.'; end if;

  select * into v_active from public.absence_count_restarts
   where person_id = p_person and cleared_at is null;
  if found then
    if v_active.from_date = p_from then return v_active.id; end if;  -- the same restart twice
    update public.absence_count_restarts
       set cleared_at = now(), cleared_by = auth.uid(), cleared_by_name = public.absence_actor_name()
     where id = v_active.id;
  end if;

  insert into public.absence_count_restarts (company_id, person_id, from_date, reason, set_by, set_by_name)
  values (v_company, p_person, p_from, left(v_reason, 500), auth.uid(), public.absence_actor_name())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.restart_absence_count(uuid, date, text) from public, anon;
grant execute on function public.restart_absence_count(uuid, date, text) to authenticated;

create or replace function public.clear_absence_restart(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_discount_absence(p_person) then
    raise exception 'Only a Manager or above can undo a restart.';
  end if;
  update public.absence_count_restarts
     set cleared_at = now(), cleared_by = auth.uid(), cleared_by_name = public.absence_actor_name()
   where person_id = p_person and cleared_at is null;
end;
$$;
revoke all on function public.clear_absence_restart(uuid) from public, anon;
grant execute on function public.clear_absence_restart(uuid) to authenticated;

-- ---------------------------------------------------------------- 5. what counts
-- Same columns as before, in the same order, plus two on the end. Everyone with an absence in the
-- window still appears (so a person whose absences are all discounted can be found and put
-- right), but only COUNTED absences make up occasions, days and the dates. Meetings held before
-- an active restart no longer set the stage. security_invoker stays on (DEF-073).
create or replace view public.person_absence_summary
with (security_invoker = on) as
with rs as (
  select r.person_id, r.from_date
  from public.absence_count_restarts r
  where r.cleared_at is null
), ev as (
  select ae.company_id,
         ae.person_id,
         ae.branch_id,
         ae.start_date,
         coalesce(ae.end_date, ae.start_date) as end_date,
         coalesce(ae.days, (coalesce(ae.end_date, ae.start_date) - ae.start_date + 1)::numeric) as days,
         (ae.discounted_at is null and (rs.from_date is null or ae.start_date >= rs.from_date)) as counts
  from public.absence_events ae
  left join public.absence_config cfg on cfg.company_id = ae.company_id
  left join rs on rs.person_id = ae.person_id
  where ae.start_date >= (current_date - (((coalesce(cfg.rolling_window_value, 6)::text || ' ') || coalesce(cfg.rolling_window_unit, 'month'))::interval))
)
select pe.company_id,
       pe.id as person_id,
       pe.full_name,
       pe.branch_id,
       (count(*) filter (where ev.counts))::integer as occasions,
       coalesce(sum(ev.days) filter (where ev.counts), 0::numeric) as total_days,
       min(ev.start_date) filter (where ev.counts) as first_absence,
       max(ev.end_date) filter (where ev.counts) as last_absence,
       ( select max(am.stage)
           from public.absence_meetings am
          where am.person_id = pe.id and am.company_id = pe.company_id
            and not (am.evidence_id is null and coalesce(am.response, '') = 'declined')
            and not exists (select 1 from rs where rs.person_id = pe.id and am.meeting_date < rs.from_date)
       ) as latest_meeting_stage,
       (count(*) filter (where not ev.counts))::integer as not_counted,
       (select rs.from_date from rs where rs.person_id = pe.id) as count_restarted_from
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;

revoke all on public.person_absence_summary from anon;
revoke insert, update, delete, truncate, references, trigger on public.person_absence_summary from authenticated;
grant select on public.person_absence_summary to authenticated;

-- 0484: staff on Parental Leave (employment_status 'mat_leave') or Long Term Sick ('lts'): their checks
-- are PAUSED, exactly as service users in hospital or on respite (0461, 0462), and fall due 7 days
-- after they come back (Phil, 2026-10-15, all companies; docs/decisions/leave-pause.md).
--
-- THE RULES (as 0461 and 0462, for People)
--   1. While employment_status is 'mat_leave' or 'lts', every check still to do is PAUSED: rag
--      'paused', a grey "Paused" pill, left out of overdue and due soon counts, every rollup, the
--      dashboard, Readiness, reminders, chasers, morning emails and the overdue reports. A check can
--      still be completed (and counts as normal). A one off already done keeps its colour; a check
--      with no due date stays 'none'.
--   2. Legal expiries (Right to Work expiry, DBS and enhanced DBS dates) are dates on person_trackers,
--      not checks, so this never touches them: they keep their colour and keep chasing (Phil's popup).
--   3. Coming back to Active, the manager gives the date (leave_returned_on, today if not given). Any
--      check due before that date + 7 days becomes due on that date + 7; later ones keep their dates.
--      The check's own due_date is never overwritten: check_instances.resume_due_date (0461) holds the
--      resumed date and is cleared by the next completion (check_instances_clear_resume, 0461).
--   4. Moving straight between Parental Leave and LTS: the pause carries on and the "since" date
--      restarts on the day of the move (as hospital and respite, 0462). Becoming a Leaver ends it.
--   5. Leavers and archived records are excluded exactly as now.
--
-- ONE PLACE: person_check_paused() and check_effective_due() (0461) are used by the status views,
-- the rollups, Readiness, the senior register and the register function (0479); the dates are kept
-- by triggers on people, so whatever changes employment_status, the rules follow.
--
-- Existing records: everyone already on leave gets leave_since = today (Phil's popup: "Today"), so
-- nothing falls due early. Nobody's resume date is set by this migration.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The dates.
-- ---------------------------------------------------------------------------------------------
alter table public.people
  add column if not exists leave_since date,
  add column if not exists leave_returned_on date;
comment on column public.people.leave_since is
  'The day their Parental Leave or Long Term Sick began this time (0484). Restarts on a move between the two; cleared when they leave both.';
comment on column public.people.leave_returned_on is
  'The day they last came back to Active from Parental Leave or Long Term Sick, given by the manager (0484).';

update public.people
   set leave_since = (now() at time zone 'Europe/London')::date
 where employment_status in ('mat_leave', 'lts')
   and leave_since is null;

-- ---------------------------------------------------------------------------------------------
-- 2. The pause rule (su_check_paused, for People).
-- ---------------------------------------------------------------------------------------------
create or replace function public.person_check_paused(p_status text, p_recurring boolean, p_last date, p_due date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_status in ('mat_leave', 'lts'), false)
     and p_due is not null
     and not (coalesce(p_recurring, true) = false and p_last is not null);
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The dates follow the status, whatever changes it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.people_leave_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_old_away boolean := coalesce(old.employment_status in ('mat_leave', 'lts'), false);
  v_new_away boolean := coalesce(new.employment_status in ('mat_leave', 'lts'), false);
  v_what text := case when old.employment_status = 'lts' then 'The date they came back from long term sick'
                      else 'The date they came back from parental leave' end;
begin
  if v_new_away and old.employment_status is distinct from new.employment_status then
    -- Going on leave, or moving between the two: the date restarts (today unless given).
    if new.leave_since is not distinct from old.leave_since then
      new.leave_since := v_today;
    end if;
    new.leave_returned_on := null;
  elsif v_old_away and not v_new_away then
    if new.employment_status = 'active' then
      new.leave_returned_on := coalesce(new.leave_returned_on, v_today);
      if new.leave_returned_on > v_today then
        raise exception '% cannot be in the future.', v_what;
      end if;
      if old.leave_since is not null and new.leave_returned_on < old.leave_since then
        raise exception '% is before the date their leave began (%).', v_what,
          to_char(old.leave_since, 'FMDD FMMonth YYYY');
      end if;
    end if;
    new.leave_since := null;
  end if;
  return new;
end;
$$;
revoke all on function public.people_leave_dates() from public, anon, authenticated;

drop trigger if exists people_leave_dates on public.people;
create trigger people_leave_dates
  before update of employment_status on public.people
  for each row execute function public.people_leave_dates();

-- Rule 3: only on coming back to Active.
create or replace function public.people_leave_resume()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resume date;
begin
  if old.employment_status in ('mat_leave', 'lts') and new.employment_status = 'active'
     and new.leave_returned_on is not null then
    v_resume := new.leave_returned_on + 7;
    update public.check_instances ci
       set resume_due_date = v_resume
      from public.check_definitions cd
     where cd.id = ci.definition_id
       and ci.person_id = new.id
       and ci.active
       and ci.due_date is not null
       and not (cd.recurring = false and ci.last_completed_on is not null)
       and public.check_effective_due(ci.due_date, ci.resume_due_date) < v_resume;
  end if;
  return null;
end;
$$;
revoke all on function public.people_leave_resume() from public, anon, authenticated;

drop trigger if exists people_leave_resume on public.people;
create trigger people_leave_resume
  after update of employment_status on public.people
  for each row execute function public.people_leave_resume();

-- ---------------------------------------------------------------------------------------------
-- 4. The status views: as now, word for word, except that due_date is the date that counts (the
--    resumed one after leave) and rag is 'paused' while on leave. New columns at the end, so
--    nothing reading them moves.
-- ---------------------------------------------------------------------------------------------
create or replace view public.person_check_status
with (security_invoker = true) as
 SELECT ci.id AS instance_id,
    ci.company_id,
    ci.branch_id,
    ci.person_id,
    ci.definition_id,
    cd.key AS check_key,
    cd.name AS check_name,
    cd.population,
    cd.recurring,
    cd.anchor,
    cd.form_id,
    cd.expiry_field_key,
    public.check_effective_due(ci.due_date, ci.resume_due_date) AS due_date,
    ci.last_completed_on,
    ci.expiry_date,
    ci.last_evidence_id,
    COALESCE(cd.amber_days, co.amber_days_default, 30) AS effective_amber,
        CASE
            WHEN public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date) THEN 'paused'::text
            ELSE check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), COALESCE(cd.amber_days, co.amber_days_default, 30))
        END AS rag,
    ci.due_date AS scheduled_due_date,
    public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date) AS paused,
    pe.leave_since,
    pe.employment_status
   FROM (((check_instances ci
     JOIN check_definitions cd ON ((cd.id = ci.definition_id)))
     JOIN people pe ON (((pe.id = ci.person_id) AND (pe.company_id = ci.company_id))))
     JOIN companies co ON ((co.id = ci.company_id)))
  WHERE (ci.active AND cd.active AND (pe.employment_status <> 'leaver'::text) AND (pe.archived_at IS NULL));

create or replace view public.person_check_status_all
with (security_invoker = true) as
 SELECT ci.id AS instance_id,
    ci.company_id,
    ci.branch_id,
    ci.person_id,
    ci.definition_id,
    cd.key AS check_key,
    cd.name AS check_name,
    cd.population,
    cd.recurring,
    cd.anchor,
    cd.form_id,
    cd.expiry_field_key,
    public.check_effective_due(ci.due_date, ci.resume_due_date) AS due_date,
    ci.last_completed_on,
    ci.expiry_date,
    ci.last_evidence_id,
    COALESCE(cd.amber_days, co.amber_days_default, 30) AS effective_amber,
        CASE
            WHEN public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date) THEN 'paused'::text
            ELSE check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), COALESCE(cd.amber_days, co.amber_days_default, 30))
        END AS rag,
    ci.due_date AS scheduled_due_date,
    public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date) AS paused,
    pe.leave_since,
    pe.employment_status
   FROM (((check_instances ci
     JOIN check_definitions cd ON ((cd.id = ci.definition_id)))
     JOIN people pe ON ((pe.id = ci.person_id)))
     JOIN companies co ON ((co.id = ci.company_id)))
  WHERE (ci.active AND cd.active);

-- ---------------------------------------------------------------------------------------------
-- 5. The rollups: a record whose checks are paused rolls up as 'paused', never green (as 0461).
-- ---------------------------------------------------------------------------------------------
create or replace view public.person_rollup
with (security_invoker = true) as
 SELECT pe.id AS person_id,
    pe.company_id,
    pe.branch_id,
    count(s.instance_id) AS total_checks,
    count(*) FILTER (WHERE (s.rag = 'red'::text)) AS red_count,
    count(*) FILTER (WHERE (s.rag = 'amber'::text)) AS amber_count,
    count(*) FILTER (WHERE (s.rag = 'green'::text)) AS green_count,
        CASE
            WHEN (count(*) FILTER (WHERE (s.rag = 'red'::text)) > 0) THEN 'red'::text
            WHEN (count(*) FILTER (WHERE (s.rag = 'amber'::text)) > 0) THEN 'amber'::text
            WHEN (count(*) FILTER (WHERE (s.rag = 'paused'::text)) > 0) THEN 'paused'::text
            WHEN (count(s.instance_id) = 0) THEN 'none'::text
            ELSE 'green'::text
        END AS rag,
    count(*) FILTER (WHERE (s.rag = 'paused'::text)) AS paused_count
   FROM (people pe
     LEFT JOIN person_check_status s ON ((s.person_id = pe.id)))
  WHERE ((pe.employment_status <> 'leaver'::text) AND (pe.archived_at IS NULL))
  GROUP BY pe.id, pe.company_id, pe.branch_id;

create or replace view public.person_rollup_all
with (security_invoker = true) as
 SELECT pe.id AS person_id,
    pe.company_id,
    pe.branch_id,
    count(s.instance_id) AS total_checks,
    count(*) FILTER (WHERE (s.rag = 'red'::text)) AS red_count,
    count(*) FILTER (WHERE (s.rag = 'amber'::text)) AS amber_count,
    count(*) FILTER (WHERE (s.rag = 'green'::text)) AS green_count,
        CASE
            WHEN (count(*) FILTER (WHERE (s.rag = 'red'::text)) > 0) THEN 'red'::text
            WHEN (count(*) FILTER (WHERE (s.rag = 'amber'::text)) > 0) THEN 'amber'::text
            WHEN (count(*) FILTER (WHERE (s.rag = 'paused'::text)) > 0) THEN 'paused'::text
            WHEN (count(s.instance_id) = 0) THEN 'none'::text
            ELSE 'green'::text
        END AS rag,
    count(*) FILTER (WHERE (s.rag = 'paused'::text)) AS paused_count
   FROM (people pe
     LEFT JOIN person_check_status_all s ON ((s.person_id = pe.id)))
  GROUP BY pe.id, pe.company_id, pe.branch_id;

-- ---------------------------------------------------------------------------------------------
-- 6. The People register's read (0479): the same rows and columns as person_check_status_all.
--    Its columns grow with the view's, so it is dropped and made again (nothing else uses it).
-- ---------------------------------------------------------------------------------------------
drop function if exists public.register_person_status(uuid);
create function public.register_person_status(p_company uuid)
returns table (
  instance_id uuid, company_id uuid, branch_id uuid, person_id uuid, definition_id uuid,
  check_key text, check_name text, population text, recurring boolean, anchor text, form_id uuid,
  expiry_field_key text, due_date date, last_completed_on date, expiry_date date,
  last_evidence_id uuid, effective_amber integer, rag text, scheduled_due_date date,
  paused boolean, leave_since date, employment_status text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select ci.id, ci.company_id, ci.branch_id, ci.person_id, ci.definition_id,
         cd.key, cd.name, cd.population, cd.recurring, cd.anchor, cd.form_id, cd.expiry_field_key,
         public.check_effective_due(ci.due_date, ci.resume_due_date),
         ci.last_completed_on, ci.expiry_date, ci.last_evidence_id,
         coalesce(cd.amber_days, co.amber_days_default, 30),
         case
           when public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date) then 'paused'
           else public.check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), coalesce(cd.amber_days, co.amber_days_default, 30))
         end,
         ci.due_date,
         public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date),
         pe.leave_since,
         pe.employment_status
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    join public.people pe on pe.id = ci.person_id and pe.company_id = ci.company_id
    join public.companies co on co.id = ci.company_id
   where ci.company_id = p_company
     and ci.active and cd.active;
$$;
revoke all on function public.register_person_status(uuid) from public, anon;
grant execute on function public.register_person_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Readiness: a paused check is left out of the scores (as 0461 for service users). As 0461
--    otherwise, word for word; readiness_check_counts (0479) the same.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_framework_check_readiness(p_company uuid, p_regulator text, p_branch uuid default null)
returns table(requirement_id uuid, overdue integer, due_soon integer, on_track integer, total integer, unscheduled integer, waiting_sup3 integer, waiting_appraisal integer, waiting_probation integer)
language sql
stable
set search_path = public, pg_temp
as $function$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           public.check_effective_due(ci.due_date, ci.resume_due_date) as due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber,
           ( ci.last_completed_on is not null
             and ( cd.recurring = false or public.check_effective_due(ci.due_date, ci.resume_due_date) <= ci.last_completed_on ) ) as settled,
           case
             when ci.due_date is not null then 'dated'
             when cd.schedule_mode = 'ad_hoc' then 'ad_hoc'
             when ci.record_type = 'person' and cd.key = 'appraisal'
                  and cd.schedule_mode = 'after_sup3' then 'wait_sup3'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and ci.last_completed_on is not null then 'wait_appraisal'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and t.probation_end_actual is null
                  and not exists (
                    select 1
                    from public.check_instances a
                    join public.check_definitions ad on ad.id = a.definition_id and ad.key = 'appraisal'
                    where a.person_id = ci.person_id and a.last_completed_on is not null
                  ) then 'wait_probation'
             else 'unscheduled'
           end as bucket
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
    left join public.person_trackers t on t.person_id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status <> 'leaver' and pe.archived_at is null
             and not public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date))
         or (ci.record_type = 'service_user' and su.service_status <> 'cancelled' and su.archived_at is null
             and not public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date)) )
      and ( p_branch is null or coalesce(pe.branch_id, su.branch_id) = p_branch )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and not settled and due_date < ((now() at time zone 'Europe/London')::date))::int as overdue,
    count(*) filter (where due_date is not null and not settled and due_date >= ((now() at time zone 'Europe/London')::date) and due_date <= ((now() at time zone 'Europe/London')::date) + amber)::int as due_soon,
    count(*) filter (where due_date is not null and (settled or due_date > ((now() at time zone 'Europe/London')::date) + amber))::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    count(*) filter (where bucket = 'unscheduled')::int as unscheduled,
    count(*) filter (where bucket = 'wait_sup3')::int as waiting_sup3,
    count(*) filter (where bucket = 'wait_appraisal')::int as waiting_appraisal,
    count(*) filter (where bucket = 'wait_probation')::int as waiting_probation
  from inst
  group by requirement_id;
$function$;

create or replace function public.readiness_check_counts(p_company uuid, p_regulator text, p_branch uuid default null)
returns table (
  requirement_id uuid, overdue integer, due_soon integer, on_track integer, total integer,
  unscheduled integer, waiting_sup3 integer, waiting_appraisal integer, waiting_probation integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           public.check_effective_due(ci.due_date, ci.resume_due_date) as due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber,
           ( ci.last_completed_on is not null
             and ( cd.recurring = false or public.check_effective_due(ci.due_date, ci.resume_due_date) <= ci.last_completed_on ) ) as settled,
           case
             when ci.due_date is not null then 'dated'
             when cd.schedule_mode = 'ad_hoc' then 'ad_hoc'
             when ci.record_type = 'person' and cd.key = 'appraisal'
                  and cd.schedule_mode = 'after_sup3' then 'wait_sup3'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and ci.last_completed_on is not null then 'wait_appraisal'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and t.probation_end_actual is null
                  and not exists (
                    select 1
                    from public.check_instances a
                    join public.check_definitions ad on ad.id = a.definition_id and ad.key = 'appraisal'
                    where a.person_id = ci.person_id and a.company_id = p_company and a.last_completed_on is not null
                  ) then 'wait_probation'
             else 'unscheduled'
           end as bucket
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id and pe.company_id = p_company
    left join public.person_trackers t on t.person_id = ci.person_id and t.company_id = p_company
    left join public.service_users su on su.id = ci.service_user_id and su.company_id = p_company
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status <> 'leaver' and pe.archived_at is null
             and not public.person_check_paused(pe.employment_status, cd.recurring, ci.last_completed_on, ci.due_date))
         or (ci.record_type = 'service_user' and su.service_status <> 'cancelled' and su.archived_at is null
             and not public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date)) )
      and ( p_branch is null or coalesce(pe.branch_id, su.branch_id) = p_branch )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and not settled and due_date < ((now() at time zone 'Europe/London')::date))::int as overdue,
    count(*) filter (where due_date is not null and not settled and due_date >= ((now() at time zone 'Europe/London')::date) and due_date <= ((now() at time zone 'Europe/London')::date) + amber)::int as due_soon,
    count(*) filter (where due_date is not null and (settled or due_date > ((now() at time zone 'Europe/London')::date) + amber))::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    count(*) filter (where bucket = 'unscheduled')::int as unscheduled,
    count(*) filter (where bucket = 'wait_sup3')::int as waiting_sup3,
    count(*) filter (where bucket = 'wait_appraisal')::int as waiting_appraisal,
    count(*) filter (where bucket = 'wait_probation')::int as waiting_probation
  from inst
  group by requirement_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. The senior's register already shows only active staff; after a leave, the resumed date
--    counts (as service users after a stay, 0461). Otherwise as 0461, word for word.
-- ---------------------------------------------------------------------------------------------
create or replace function public.senior_register(p_kind text)
returns table(record_id uuid, full_name text, branch_name text, instance_id uuid, check_name text, check_key text, check_order integer, due_date date, last_completed_on date, rag text, has_form boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_company uuid;
begin
  select p.company_id into v_company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'senior' and p.status = 'active';
  if v_company is null then return; end if;
  if p_kind not in ('people', 'service_users') then return; end if;
  if exists (
    select 1 from public.company_role_modules m
    where m.company_id = v_company and m.role = 'senior' and m.module_key = p_kind
  ) then
    return;
  end if;

  if p_kind = 'people' then
    return query
      select pe.id, pe.full_name, b.name,
             ci.id, cd.name, cd.key, cd.sort_order,
             public.check_effective_due(ci.due_date, ci.resume_due_date), ci.last_completed_on,
             case when ci.id is null then null
                  else public.check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), coalesce(cd.amber_days, co.amber_days_default, 30)) end,
             cd.form_id is not null
      from public.people pe
      join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = pe.branch_id
      join public.companies co on co.id = pe.company_id
      left join public.check_instances ci
        on ci.person_id = pe.id and ci.active
       and pe.profile_id is distinct from auth.uid()
       and exists (select 1 from public.check_definitions d2 where d2.id = ci.definition_id and d2.active)
       and not exists (
         select 1 from public.senior_check_access_off o
         where o.company_id = v_company and o.definition_id = ci.definition_id
       )
      left join public.check_definitions cd on cd.id = ci.definition_id
      where pe.company_id = v_company
        and pe.archived_at is null
        and coalesce(pe.employment_status, 'active') = 'active'
      order by pe.surname_key nulls last, pe.full_name, cd.sort_order nulls last, cd.name;
  else
    return query
      select su.id, su.full_name, b.name,
             ci.id, cd.name, cd.key, cd.sort_order,
             public.check_effective_due(ci.due_date, ci.resume_due_date), ci.last_completed_on,
             case when ci.id is null then null
                  when (not cd.recurring) and ci.last_completed_on is not null then 'green'
                  else public.check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), coalesce(cd.amber_days, co.amber_days_default, 30)) end,
             cd.form_id is not null
      from public.service_users su
      join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = su.branch_id
      join public.companies co on co.id = su.company_id
      left join public.check_instances ci
        on ci.service_user_id = su.id and ci.active
       and exists (select 1 from public.check_definitions d2 where d2.id = ci.definition_id and d2.active)
       and not exists (
         select 1 from public.senior_check_access_off o
         where o.company_id = v_company and o.definition_id = ci.definition_id
       )
      left join public.check_definitions cd on cd.id = ci.definition_id
      where su.company_id = v_company
        and su.archived_at is null
        and coalesce(su.service_status, 'active') = 'active'
        and (su.discharge_date is null or su.discharge_date >= (now() at time zone 'Europe/London')::date)
      order by su.surname_key nulls last, su.full_name, cd.sort_order nulls last, cd.name;
  end if;
end;
$function$;

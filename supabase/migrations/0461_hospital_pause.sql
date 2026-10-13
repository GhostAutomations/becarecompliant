-- 0461: service users in hospital: their checks are paused, nobody is chased, and they are due
-- 7 days after they come back (Phil, 2026-10-13, all companies; docs/decisions/hospital-pause.md).
--
-- THE RULES
--   1. While service_status is 'hospital', every check still to do is PAUSED: rag 'paused', a grey
--      "Paused: in hospital" pill, left out of overdue and due soon counts, the dashboard, rollups,
--      readiness scores, reminders, chasers and digests. A check can still be completed. A one off
--      already done stays green (done is never outstanding). A check with no due date stays 'none'.
--   2. When they come out of hospital the manager gives the date (Phil: "ask for a date they came
--      out of hospital"). Any check due before that date + 7 days becomes due on that date + 7;
--      later ones keep their dates. The check's own due_date is NEVER overwritten: the resumed date
--      is kept beside it (resume_due_date) and cleared by the next completion, after which the
--      recurrence works exactly as before. Saving the same return twice changes nothing.
--   3. Cancelled (discharged) and archived service users stay excluded as now. People unchanged.
--
-- ONE PLACE: the two shared rules below (su_check_paused, check_effective_due) are used by the
-- status views, the rollups, readiness and the senior register; the dates are written by a trigger
-- on service_users, so whatever changes the status, the rules follow.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The dates.
-- ---------------------------------------------------------------------------------------------
alter table public.service_users
  add column if not exists hospital_since date,
  add column if not exists hospital_returned_on date;
comment on column public.service_users.hospital_since is
  'The day they went into hospital this time (0461). Set when the status becomes hospital; cleared when they leave it.';
comment on column public.service_users.hospital_returned_on is
  'The day they last came out of hospital, given by the manager (0461).';

alter table public.check_instances
  add column if not exists resume_due_date date;
comment on column public.check_instances.resume_due_date is
  'Due date after a hospital stay: the return date + 7 days, when the check fell due before that (0461). Cleared by the next completion.';

-- ---------------------------------------------------------------------------------------------
-- 2. The two shared rules.
-- ---------------------------------------------------------------------------------------------
create or replace function public.check_effective_due(p_due date, p_resume date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_resume is not null and p_due is not null and p_due < p_resume then p_resume else p_due end;
$$;

create or replace function public.su_check_paused(p_status text, p_recurring boolean, p_last date, p_due date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_status = 'hospital', false)
     and p_due is not null
     and not (coalesce(p_recurring, true) = false and p_last is not null);
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The dates follow the status, whatever changes it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.service_users_hospital_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if new.service_status = 'hospital' and old.service_status is distinct from 'hospital' then
    new.hospital_since := coalesce(new.hospital_since, v_today);
    new.hospital_returned_on := null;
  elsif old.service_status = 'hospital' and new.service_status is distinct from 'hospital' then
    if new.service_status in ('active', 'respite') then
      new.hospital_returned_on := coalesce(new.hospital_returned_on, v_today);
      if new.hospital_returned_on > v_today then
        raise exception 'The date they came out of hospital cannot be in the future.';
      end if;
      if old.hospital_since is not null and new.hospital_returned_on < old.hospital_since then
        raise exception 'The date they came out of hospital is before the date they went in (%).',
          to_char(old.hospital_since, 'FMDD FMMonth YYYY');
      end if;
    end if;
    new.hospital_since := null;
  end if;
  return new;
end;
$$;
revoke all on function public.service_users_hospital_dates() from public, anon, authenticated;

drop trigger if exists service_users_hospital_dates on public.service_users;
create trigger service_users_hospital_dates
  before update of service_status on public.service_users
  for each row execute function public.service_users_hospital_dates();

-- Rule 2: on coming back, checks due before return + 7 days are due on return + 7 days.
create or replace function public.service_users_hospital_resume()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resume date;
begin
  if old.service_status = 'hospital' and new.service_status in ('active', 'respite')
     and new.hospital_returned_on is not null then
    v_resume := new.hospital_returned_on + 7;
    update public.check_instances ci
       set resume_due_date = v_resume
      from public.check_definitions cd
     where cd.id = ci.definition_id
       and ci.service_user_id = new.id
       and ci.active
       and ci.due_date is not null
       and not (cd.recurring = false and ci.last_completed_on is not null)
       and public.check_effective_due(ci.due_date, ci.resume_due_date) < v_resume;
  end if;
  return null;
end;
$$;
revoke all on function public.service_users_hospital_resume() from public, anon, authenticated;

drop trigger if exists service_users_hospital_resume on public.service_users;
create trigger service_users_hospital_resume
  after update of service_status on public.service_users
  for each row execute function public.service_users_hospital_resume();

-- After the next completion the recurrence works exactly as before.
create or replace function public.check_instances_clear_resume()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.resume_due_date is not null
     and new.last_completed_on is not null
     and new.last_completed_on is distinct from old.last_completed_on then
    new.resume_due_date := null;
  end if;
  return new;
end;
$$;
revoke all on function public.check_instances_clear_resume() from public, anon, authenticated;

drop trigger if exists check_instances_clear_resume on public.check_instances;
create trigger check_instances_clear_resume
  before update on public.check_instances
  for each row execute function public.check_instances_clear_resume();

-- ---------------------------------------------------------------------------------------------
-- 4. The status views: due_date is the date that counts (the resumed one after a hospital stay),
--    rag is 'paused' while in hospital. New columns at the end, so nothing reading them moves.
-- ---------------------------------------------------------------------------------------------
create or replace view public.service_user_check_status
with (security_invoker = on) as
 SELECT ci.id AS instance_id,
    ci.company_id,
    ci.branch_id,
    ci.service_user_id,
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
            WHEN ((NOT cd.recurring) AND (ci.last_completed_on IS NOT NULL)) THEN 'green'::text
            WHEN public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date) THEN 'paused'::text
            ELSE check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), COALESCE(cd.amber_days, co.amber_days_default, 30))
        END AS rag,
    ci.due_date AS scheduled_due_date,
    public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date) AS paused,
    su.hospital_since
   FROM (((check_instances ci
     JOIN check_definitions cd ON ((cd.id = ci.definition_id)))
     JOIN service_users su ON (((su.id = ci.service_user_id) AND (su.company_id = ci.company_id))))
     JOIN companies co ON ((co.id = ci.company_id)))
  WHERE (ci.active AND cd.active AND (su.service_status <> 'cancelled'::text) AND (su.archived_at IS NULL));

create or replace view public.service_user_check_status_all
with (security_invoker = on) as
 SELECT ci.id AS instance_id,
    ci.company_id,
    ci.branch_id,
    ci.service_user_id,
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
            WHEN ((NOT cd.recurring) AND (ci.last_completed_on IS NOT NULL)) THEN 'green'::text
            WHEN public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date) THEN 'paused'::text
            ELSE check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), COALESCE(cd.amber_days, co.amber_days_default, 30))
        END AS rag,
    ci.due_date AS scheduled_due_date,
    public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date) AS paused,
    su.hospital_since
   FROM (((check_instances ci
     JOIN check_definitions cd ON ((cd.id = ci.definition_id)))
     JOIN service_users su ON ((su.id = ci.service_user_id)))
     JOIN companies co ON ((co.id = ci.company_id)))
  WHERE (ci.active AND cd.active);

-- ---------------------------------------------------------------------------------------------
-- 5. The rollups: a record whose checks are paused rolls up as 'paused', never green.
-- ---------------------------------------------------------------------------------------------
create or replace view public.service_user_rollup
with (security_invoker = on) as
 SELECT su.id AS service_user_id,
    su.company_id,
    su.branch_id,
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
   FROM (service_users su
     LEFT JOIN service_user_check_status s ON ((s.service_user_id = su.id)))
  WHERE ((su.service_status <> 'cancelled'::text) AND (su.archived_at IS NULL))
  GROUP BY su.id, su.company_id, su.branch_id;

create or replace view public.service_user_rollup_all
with (security_invoker = on) as
 SELECT su.id AS service_user_id,
    su.company_id,
    su.branch_id,
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
   FROM (service_users su
     LEFT JOIN service_user_check_status_all s ON ((s.service_user_id = su.id)))
  GROUP BY su.id, su.company_id, su.branch_id;

-- ---------------------------------------------------------------------------------------------
-- 6. Readiness: a paused check is left out of the scores; after a stay, the resumed date counts.
--    As 0383 otherwise, word for word.
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
      and ( (ci.record_type = 'person' and pe.employment_status <> 'leaver' and pe.archived_at is null)
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

-- ---------------------------------------------------------------------------------------------
-- 7. The senior's register (hospital already left out): after a stay, the resumed date counts.
--    As 0340 otherwise, word for word.
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
             ci.due_date, ci.last_completed_on,
             case when ci.id is null then null
                  else public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) end,
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

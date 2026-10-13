-- 0462: service users on RESPITE are paused exactly as in hospital (Phil, 2026-10-13, "Let's do the
-- same for respite", all companies; docs/decisions/hospital-pause.md).
--
-- THE RULES (0461, now for both places)
--   1. While service_status is 'hospital' or 'respite', every check still to do is PAUSED: rag
--      'paused', a grey pill ("Paused: in respite"), out of every count, score, chaser and digest.
--      A one off already done stays green; a check with no due date stays 'none'.
--   2. Only on coming back to ACTIVE is the date asked for. Checks due before that date + 7 days are
--      due on that date + 7 (resume_due_date, beside the due date, cleared by the next completion).
--   3. Moving straight between hospital and respite (Phil's popup: "Stay paused, date restarts"):
--      the pause carries on, the wording follows the new place, and the "since" date restarts on
--      the day of the move. No return date is asked for and nothing is resumed until Active.
--
-- The columns keep their 0461 names (hospital_since, hospital_returned_on): they now hold the dates
-- for either place. Nobody is on respite at any company today, so no record changes colour.
--
-- Safe to run twice.

comment on column public.service_users.hospital_since is
  'The day they went into hospital or onto respite this time (0461, 0462). Restarts on a move between the two; cleared when they leave both.';
comment on column public.service_users.hospital_returned_on is
  'The day they last came back to Active from hospital or respite, given by the manager (0461, 0462).';
comment on column public.check_instances.resume_due_date is
  'Due date after a hospital or respite stay: the return date + 7 days, when the check fell due before that (0461, 0462). Cleared by the next completion.';

-- ---------------------------------------------------------------------------------------------
-- 1. The pause rule: hospital or respite.
-- ---------------------------------------------------------------------------------------------
create or replace function public.su_check_paused(p_status text, p_recurring boolean, p_last date, p_due date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_status in ('hospital', 'respite'), false)
     and p_due is not null
     and not (coalesce(p_recurring, true) = false and p_last is not null);
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The dates follow the status.
-- ---------------------------------------------------------------------------------------------
create or replace function public.service_users_hospital_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_old_away boolean := coalesce(old.service_status in ('hospital', 'respite'), false);
  v_new_away boolean := coalesce(new.service_status in ('hospital', 'respite'), false);
  v_what text := case when old.service_status = 'respite' then 'The date they came back from respite'
                      else 'The date they came out of hospital' end;
begin
  if v_new_away and old.service_status is distinct from new.service_status then
    -- Going in, or moving between hospital and respite: the date restarts (today unless given).
    if new.hospital_since is not distinct from old.hospital_since then
      new.hospital_since := v_today;
    end if;
    new.hospital_returned_on := null;
  elsif v_old_away and not v_new_away then
    if new.service_status = 'active' then
      new.hospital_returned_on := coalesce(new.hospital_returned_on, v_today);
      if new.hospital_returned_on > v_today then
        raise exception '% cannot be in the future.', v_what;
      end if;
      if old.hospital_since is not null and new.hospital_returned_on < old.hospital_since then
        raise exception '% is before the date they went in (%).', v_what,
          to_char(old.hospital_since, 'FMDD FMMonth YYYY');
      end if;
    end if;
    new.hospital_since := null;
  end if;
  return new;
end;
$$;
revoke all on function public.service_users_hospital_dates() from public, anon, authenticated;

-- Rule 2: only on coming back to Active.
create or replace function public.service_users_hospital_resume()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resume date;
begin
  if old.service_status in ('hospital', 'respite') and new.service_status = 'active'
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

-- ---------------------------------------------------------------------------------------------
-- 3. The status views: as 0461, with service_status added at the end so the pill can say where.
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
    su.hospital_since,
    su.service_status
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
    su.hospital_since,
    su.service_status
   FROM (((check_instances ci
     JOIN check_definitions cd ON ((cd.id = ci.definition_id)))
     JOIN service_users su ON ((su.id = ci.service_user_id)))
     JOIN companies co ON ((co.id = ci.company_id)))
  WHERE (ci.active AND cd.active);

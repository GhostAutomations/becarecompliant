-- 0449: past personal outcomes and past outcome updates, for a limited time
-- (Phil, 2026-10-13, docs/decisions/historic-outcomes.md).
--
-- A company may, while the Founder has the window open, add an outcome that began in the past
-- (From = start_date, To = the target date) and an update dated in the past (dated_on). Every such
-- entry carries entered_later = true, so screens, exports and the audit log can say it was added
-- after the fact. The window is a per company date (historic_outcomes_until, London time); only
-- Be Care Compliant can set it.
--
-- Also F83 (security audit 2026-10-10): the 0101 status check never allowed no_change or
-- regressing, so a "No change" or "Regressing" update was stored but the outcome's status quietly
-- stayed as it was. The check now allows every status the app writes.
--
-- Safe to run twice.

alter table public.companies
  add column if not exists historic_outcomes_until date;

comment on column public.companies.historic_outcomes_until is
  'Past outcomes and updates may be added up to and including this London date. Null = off. Founder only.';

alter table public.service_user_outcomes
  add column if not exists start_date date,
  add column if not exists entered_later boolean not null default false,
  add column if not exists entered_by_name text;

comment on column public.service_user_outcomes.start_date is
  'When the outcome began, when that is not the day it was added (past outcomes, back dated reviews). Null = the London date of created_at.';

alter table public.service_user_outcome_updates
  add column if not exists dated_on date,
  add column if not exists entered_later boolean not null default false;

comment on column public.service_user_outcome_updates.dated_on is
  'The date the update speaks for, when that is not the day it was added. Null = the London date of created_at.';

-- F83: allow every status the app writes.
alter table public.service_user_outcomes drop constraint if exists service_user_outcomes_status_check;
alter table public.service_user_outcomes add constraint service_user_outcomes_status_check
  check (status in ('working_towards', 'progressing', 'no_change', 'regressing', 'achieved', 'no_longer_relevant'));

-- Only Be Care Compliant may open or close the window.
create or replace function public.companies_guard_founder_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.tier is distinct from old.tier
     or new.status is distinct from old.status
     or new.trial_started_at is distinct from old.trial_started_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.trial_owner_email is distinct from old.trial_owner_email
     or new.trial_owner_domain is distinct from old.trial_owner_domain
     or new.provisioned_by is distinct from old.provisioned_by
     or new.deleted_at is distinct from old.deleted_at
     or new.purge_after is distinct from old.purge_after
     or new.slug is distinct from old.slug
     or new.framework_enabled is distinct from old.framework_enabled
     or new.agreement_required is distinct from old.agreement_required
     or new.is_test is distinct from old.is_test
     or new.branch_word is distinct from old.branch_word
     or new.branch_word_plural is distinct from old.branch_word_plural
     or new.historic_outcomes_until is distinct from old.historic_outcomes_until then
    raise exception 'Only Be Care Compliant can change your plan, trial or account status.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- The rules for dated outcomes, enforced whatever writes the row.
--   A signed in user may set start_date only on a past outcome (entered_later) while the window is
--   open. The service role (a back dated Individual Plan Review) may date an outcome without the
--   window, because the review's own date is what it speaks for.
--   No date in the future; the target date (To) never before From.
create or replace function public.guard_dated_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_until date;
begin
  if tg_op = 'UPDATE'
     and new.start_date is not distinct from old.start_date
     and new.entered_later is not distinct from old.entered_later
     and new.target_date is not distinct from old.target_date then
    return new;
  end if;

  if new.entered_later and new.start_date is null then
    raise exception 'A past outcome needs its From date.' using errcode = '23514';
  end if;

  if (tg_op = 'INSERT' and (new.entered_later or new.start_date is not null))
     or (tg_op = 'UPDATE' and (new.entered_later is distinct from old.entered_later
                               or new.start_date is distinct from old.start_date)) then
    if auth.uid() is not null then
      if not new.entered_later then
        raise exception 'Only a past outcome can carry its own From date.' using errcode = '42501';
      end if;
      select historic_outcomes_until into v_until from public.companies where id = new.company_id;
      if v_until is null or v_today > v_until then
        raise exception 'Adding past outcomes is closed for this company.' using errcode = '42501';
      end if;
    end if;
    if new.start_date > v_today then
      raise exception 'The From date cannot be in the future.' using errcode = '23514';
    end if;
  end if;

  if new.start_date is not null and new.target_date is not null and new.target_date < new.start_date then
    raise exception 'The To date cannot be before the From date.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_dated_outcome() from public, anon, authenticated;

drop trigger if exists guard_dated_outcome on public.service_user_outcomes;
create trigger guard_dated_outcome
  before insert or update on public.service_user_outcomes
  for each row execute function public.guard_dated_outcome();

-- The same for an update: a signed in user dates one only as a past update while the window is
-- open; never in the future; never before its outcome began.
create or replace function public.guard_dated_outcome_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_until date;
  v_from date;
begin
  if tg_op = 'UPDATE'
     and new.dated_on is not distinct from old.dated_on
     and new.entered_later is not distinct from old.entered_later then
    return new;
  end if;
  if new.dated_on is null and not new.entered_later then
    return new;
  end if;
  if new.entered_later and new.dated_on is null then
    raise exception 'A past update needs its date.' using errcode = '23514';
  end if;

  if auth.uid() is not null then
    if not new.entered_later then
      raise exception 'Only a past update can carry its own date.' using errcode = '42501';
    end if;
    select historic_outcomes_until into v_until from public.companies where id = new.company_id;
    if v_until is null or v_today > v_until then
      raise exception 'Adding past updates is closed for this company.' using errcode = '42501';
    end if;
  end if;

  if new.dated_on > v_today then
    raise exception 'The update''s date cannot be in the future.' using errcode = '23514';
  end if;

  select coalesce(o.start_date, (o.created_at at time zone 'Europe/London')::date)
    into v_from
    from public.service_user_outcomes o
   where o.id = new.outcome_id;
  if v_from is not null and new.dated_on < v_from then
    raise exception 'An update cannot be dated before its outcome began.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_dated_outcome_update() from public, anon, authenticated;

drop trigger if exists guard_dated_outcome_update on public.service_user_outcome_updates;
create trigger guard_dated_outcome_update
  before insert or update on public.service_user_outcome_updates
  for each row execute function public.guard_dated_outcome_update();

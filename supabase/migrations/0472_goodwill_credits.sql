-- 0472: Goodwill credits (Phil, 2026-10-14; docs/decisions/goodwill-credits.md).
--
-- The Founder gives a company extra SMS credits, AI credits or both: once, weekly or monthly.
-- Goodwill credits never expire: they are added to the balance like a top up (the monthly
-- allowance ADDS too, so nothing wipes them). Each credit given is a ledger row with reason
-- 'goodwill' and ref 'goodwill:<grant id>:<period number>'.
--
--  1. 'goodwill' joins the reasons both credit ledgers allow; an AI goodwill ref is unique, as an
--     SMS ref already is (0160).
--  2. goodwill_grants: the plan. Founder only; the customer never sees the reason or the note.
--  3. goodwill_grant_periods: one row per credit given, unique on (grant, period), so running the
--     job twice for the same period gives nothing the second time.
--  4. goodwill_due_date(): the schedule. Weekly is the start then every 7 days; monthly is the
--     same day each month, a day the month lacks becoming its last day (Postgres date + interval
--     months clamps exactly so). Mirrored in lib/billing/goodwill-schedule.ts and its tests.
--  5. grant_due_goodwill(): gives every period that is due (Europe/London) and not yet given, then
--     marks the grant finished once its last period is given. The daily cron
--     (/api/cron/goodwill-credits) calls it with the service role; create calls it for a grant that
--     starts today.
--  6. create_goodwill_grant() and stop_goodwill_grant(): Founder only, checked inside. Stopping
--     keeps every credit already given.
-- Every grant created, credit given and stop is written to audit_log here, in the same
-- transaction, so none can happen unlogged.

-- 1.
alter table public.sms_credit_ledger drop constraint if exists sms_credit_ledger_reason_check;
alter table public.sms_credit_ledger add constraint sms_credit_ledger_reason_check
  check (reason = any (array['monthly_grant','topup','spend','refund','adjustment','goodwill']));
alter table public.ai_credit_ledger drop constraint if exists ai_credit_ledger_reason_check;
alter table public.ai_credit_ledger add constraint ai_credit_ledger_reason_check
  check (reason = any (array['monthly_grant','topup','spend','refund','adjustment','goodwill']));
create unique index if not exists ai_credit_ledger_goodwill_ref_uidx
  on public.ai_credit_ledger (company_id, ref)
  where reason = 'goodwill';

-- 2.
create table if not exists public.goodwill_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sms_amount integer not null default 0 check (sms_amount between 0 and 100000),
  ai_amount integer not null default 0 check (ai_amount between 0 and 100000),
  frequency text not null check (frequency in ('once','weekly','monthly')),
  start_date date not null,
  times integer check (times between 1 and 520),
  end_date date,
  reason text not null check (reason in ('complaint','signup_deal','promotion','other')),
  private_note text check (private_note is null or length(private_note) <= 2000),
  status text not null default 'active' check (status in ('active','stopped','finished')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  stopped_at timestamptz,
  stopped_by uuid references public.profiles(id) on delete set null,
  finished_at timestamptz,
  constraint goodwill_grants_some_credits check (sms_amount + ai_amount > 0),
  constraint goodwill_grants_how_long check (
    case frequency
      when 'once' then times is null and end_date is null
      else (times is null) <> (end_date is null)
    end),
  constraint goodwill_grants_end_after_start check (end_date is null or end_date >= start_date)
);
create index if not exists goodwill_grants_company_idx on public.goodwill_grants (company_id);
create index if not exists goodwill_grants_active_idx on public.goodwill_grants (status) where status = 'active';

-- 3.
create table if not exists public.goodwill_grant_periods (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.goodwill_grants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  period_no integer not null check (period_no >= 0),
  due_date date not null,
  sms_amount integer not null,
  ai_amount integer not null,
  granted_at timestamptz not null default now(),
  unique (grant_id, period_no)
);
create index if not exists goodwill_grant_periods_company_idx on public.goodwill_grant_periods (company_id);

alter table public.goodwill_grants enable row level security;
alter table public.goodwill_grant_periods enable row level security;
-- Read: the Founder only. Write: only through the functions below (no insert, update or delete
-- policy, so a direct write from a login is refused).
drop policy if exists goodwill_grants_select on public.goodwill_grants;
create policy goodwill_grants_select on public.goodwill_grants
  for select to authenticated using (public.is_platform_admin());
drop policy if exists goodwill_grant_periods_select on public.goodwill_grant_periods;
create policy goodwill_grant_periods_select on public.goodwill_grant_periods
  for select to authenticated using (public.is_platform_admin());
revoke all on public.goodwill_grants, public.goodwill_grant_periods from anon;
revoke insert, update, delete, truncate on public.goodwill_grants, public.goodwill_grant_periods from authenticated;

-- 4.
create or replace function public.goodwill_due_date(p_start date, p_frequency text, p_n integer)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_frequency = 'once' or p_n = 0 then p_start
    when p_frequency = 'weekly' then p_start + 7 * p_n
    else (p_start + make_interval(months => p_n))::date
  end;
$$;

-- 5.
create or replace function public.grant_due_goodwill(p_grant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  g public.goodwill_grants;
  n integer;
  d date;
  v_period uuid;
  v_given integer := 0;
  v_ref text;
begin
  for g in
    select * from public.goodwill_grants
     where status = 'active'
       and start_date <= v_today
       and (p_grant_id is null or id = p_grant_id)
       -- A deleted company is given nothing more.
       and exists (select 1 from public.companies c where c.id = company_id and c.deleted_at is null)
     order by created_at
     for update skip locked
  loop
    n := 0;
    loop
      exit when g.frequency = 'once' and n >= 1;
      exit when g.times is not null and n >= g.times;
      exit when n >= 520;
      d := public.goodwill_due_date(g.start_date, g.frequency, n);
      exit when g.end_date is not null and d > g.end_date;
      exit when d > v_today;

      v_period := null;
      insert into public.goodwill_grant_periods (grant_id, company_id, period_no, due_date, sms_amount, ai_amount)
      values (g.id, g.company_id, n, d, g.sms_amount, g.ai_amount)
      on conflict (grant_id, period_no) do nothing
      returning id into v_period;

      if v_period is not null then
        v_ref := 'goodwill:' || g.id || ':' || n;
        if g.sms_amount > 0 then
          perform public.grant_sms_credits(g.company_id, g.sms_amount, 'goodwill', v_ref);
        end if;
        if g.ai_amount > 0 then
          perform public.grant_ai_credits(g.company_id, g.ai_amount, 'goodwill', v_ref);
        end if;
        insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
        values (g.company_id, null, 'system', 'goodwill.credits_given', 'goodwill_grant', g.id::text,
                concat_ws(' and ',
                  case when g.sms_amount > 0 then g.sms_amount || ' SMS' end,
                  case when g.ai_amount > 0 then g.ai_amount || ' AI' end) || ' goodwill credits given',
                jsonb_build_object('period_no', n, 'due_date', d, 'sms', g.sms_amount, 'ai', g.ai_amount, 'ref', v_ref));
        v_given := v_given + 1;
      end if;
      n := n + 1;
    end loop;

    -- Finished once there is no further period to give.
    if (g.frequency = 'once' and n >= 1)
       or (g.times is not null and n >= g.times)
       or (g.end_date is not null and public.goodwill_due_date(g.start_date, g.frequency, n) > g.end_date)
       or n >= 520 then
      update public.goodwill_grants set status = 'finished', finished_at = now()
       where id = g.id and status = 'active';
    end if;
  end loop;
  return v_given;
end;
$$;

-- 6.
create or replace function public.create_goodwill_grant(
  p_company_id uuid,
  p_sms integer,
  p_ai integer,
  p_frequency text,
  p_start date,
  p_times integer,
  p_end date,
  p_reason text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Founder can give goodwill credits.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id and deleted_at is null) then
    raise exception 'That company was not found.' using errcode = '22023';
  end if;
  if coalesce(p_sms, 0) < 0 or coalesce(p_ai, 0) < 0 or coalesce(p_sms, 0) + coalesce(p_ai, 0) <= 0 then
    raise exception 'Give at least one SMS or AI credit.' using errcode = '22023';
  end if;
  if p_start is null or p_start < v_today then
    raise exception 'The start date cannot be in the past.' using errcode = '22023';
  end if;

  insert into public.goodwill_grants
    (company_id, sms_amount, ai_amount, frequency, start_date, times, end_date, reason, private_note, created_by)
  values
    (p_company_id, coalesce(p_sms, 0), coalesce(p_ai, 0), p_frequency, p_start,
     case when p_frequency = 'once' then null else p_times end,
     case when p_frequency = 'once' then null else p_end end,
     p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (p_company_id, auth.uid(), 'platform_admin', 'goodwill.grant_created', 'goodwill_grant', v_id::text,
          'Goodwill credits set up',
          jsonb_build_object('sms', coalesce(p_sms, 0), 'ai', coalesce(p_ai, 0), 'frequency', p_frequency,
                             'start_date', p_start, 'times', p_times, 'end_date', p_end, 'reason', p_reason));

  -- Starts today: give the first credits straight away.
  if p_start = v_today then
    perform public.grant_due_goodwill(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.stop_goodwill_grant(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g public.goodwill_grants;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Founder can stop goodwill credits.' using errcode = '42501';
  end if;
  update public.goodwill_grants
     set status = 'stopped', stopped_at = now(), stopped_by = auth.uid()
   where id = p_grant_id and status = 'active'
  returning * into g;
  if g.id is null then
    raise exception 'That grant is not running, so there is nothing to stop.' using errcode = '22023';
  end if;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (g.company_id, auth.uid(), 'platform_admin', 'goodwill.grant_stopped', 'goodwill_grant', g.id::text,
          'Goodwill credits stopped (credits already given stay)',
          jsonb_build_object('given', (select count(*) from public.goodwill_grant_periods where grant_id = g.id)));
end;
$$;

revoke all on function public.grant_due_goodwill(uuid) from public, anon, authenticated;
grant execute on function public.grant_due_goodwill(uuid) to service_role;
revoke all on function public.create_goodwill_grant(uuid, integer, integer, text, date, integer, date, text, text) from public, anon;
grant execute on function public.create_goodwill_grant(uuid, integer, integer, text, date, integer, date, text, text) to authenticated;
revoke all on function public.stop_goodwill_grant(uuid) from public, anon;
grant execute on function public.stop_goodwill_grant(uuid) to authenticated;

-- Records stay in their own company (0443).
select public.install_company_link_triggers();

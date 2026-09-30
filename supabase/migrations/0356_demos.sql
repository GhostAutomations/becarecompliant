-- 0356 DEMO ACCOUNTS (Phil, 2026-09-30).
--
-- A fresh "Demo Care Company Limited" per client, full of made up sample data. The founder sets
-- the login email, password and length (default 7 days). Demo logins are Company Admins minus
-- logins and billing, no SMS, 5 AI credits each. Logins stop at the end date and the company is
-- deleted 14 days later. The demo record, its usage figures and its feedback OUTLIVE the company
-- (company_id goes null on purge) so the founder can still see how a past demo went.

create table public.demos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid unique references public.companies(id) on delete set null,
  client_name text not null check (length(btrim(client_name)) between 1 and 120),
  contact_email text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  feedback_emailed_at timestamptz,
  deleted_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index demos_ends_at_idx on public.demos (ends_at) where deleted_at is null;

create table public.demo_logins (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references public.demos(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  ai_allowance integer not null default 5 check (ai_allowance between 0 and 1000),
  ai_used integer not null default 0 check (ai_used >= 0),
  created_at timestamptz not null default now()
);
create index demo_logins_demo_idx on public.demo_logins (demo_id);

-- One row per sign in (a Supabase session id), with the ACTIVE seconds in it.
create table public.demo_visits (
  id uuid primary key default gen_random_uuid(),
  login_id uuid not null references public.demo_logins(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  unique (login_id, session_id)
);

-- Active seconds per part of the app (people, service_users, reports...).
create table public.demo_area_time (
  login_id uuid not null references public.demo_logins(id) on delete cascade,
  area text not null check (area ~ '^[a-z_]{1,40}$'),
  seconds integer not null default 0 check (seconds >= 0),
  primary key (login_id, area)
);

create table public.demo_feedback (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references public.demos(id) on delete cascade,
  login_id uuid unique references public.demo_logins(id) on delete set null,
  token uuid not null unique default gen_random_uuid(),
  ease_of_use smallint check (ease_of_use between 1 and 5),
  looks smallint check (looks between 1 and 5),
  registers_checks smallint check (registers_checks between 1 and 5),
  forms_evidence smallint check (forms_evidence between 1 and 5),
  reports smallint check (reports between 1 and 5),
  overall smallint check (overall between 1 and 5),
  likely_to_sign_up smallint check (likely_to_sign_up between 1 and 5),
  liked text check (length(liked) <= 4000),
  disliked text check (length(disliked) <= 4000),
  better text check (length(better) <= 4000),
  submitted_at timestamptz,
  submitted_via text check (submitted_via in ('app', 'email')),
  created_at timestamptz not null default now()
);

create trigger demos_updated_at before update on public.demos
  for each row execute function public.set_updated_at();

alter table public.demos enable row level security;
alter table public.demo_logins enable row level security;
alter table public.demo_visits enable row level security;
alter table public.demo_area_time enable row level security;
alter table public.demo_feedback enable row level security;

-- The founder sees and runs everything. A demo's own users may READ their demo (end date, for
-- the banner and the expiry gate) and their own login row (AI left). Nothing else, and no writes:
-- every write a demo user makes goes through the SECURITY DEFINER functions below.
create policy demos_founder_all on public.demos for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy demos_member_read on public.demos for select to authenticated
  using (company_id is not null and public.is_company_member(company_id));
create policy demo_logins_founder_all on public.demo_logins for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy demo_logins_own_read on public.demo_logins for select to authenticated
  using (user_id = auth.uid());
create policy demo_visits_founder_read on public.demo_visits for select to authenticated
  using (public.is_platform_admin());
create policy demo_area_time_founder_read on public.demo_area_time for select to authenticated
  using (public.is_platform_admin());
create policy demo_feedback_founder_all on public.demo_feedback for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Is this company a live demo? Used by the triggers below and by the app.
create or replace function public.is_demo_company(cid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.demos d where d.company_id = cid and d.deleted_at is null);
$$;
revoke all on function public.is_demo_company(uuid) from public, anon;
grant execute on function public.is_demo_company(uuid) to authenticated, service_role;

-- NO LOGINS FROM INSIDE A DEMO, enforced in the database: a demo user cannot invite anybody or
-- make a role, so they cannot mint more logins (or more AI). The founder still can.
create or replace function public.refuse_in_demo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_demo_company(new.company_id) and not public.is_platform_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This is a demo account, so logins and roles cannot be changed here.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger invites_refuse_in_demo before insert or update on public.invites
  for each row execute function public.refuse_in_demo();
create trigger company_roles_refuse_in_demo before insert or update on public.company_roles
  for each row execute function public.refuse_in_demo();

-- AI: 5 credits PER DEMO LOGIN, not the company's balance.
create or replace function public.spend_ai_credit(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_remaining integer;
  v_login uuid;
begin
  if not public.is_company_member(cid) then
    raise exception 'spend_ai_credit: not a member of company %', cid;
  end if;
  select dl.id into v_login
    from public.demo_logins dl join public.demos d on d.id = dl.demo_id
   where dl.user_id = auth.uid() and d.company_id = cid and d.deleted_at is null;
  if v_login is not null then
    update public.demo_logins set ai_used = ai_used + 1
     where id = v_login and ai_used < ai_allowance
     returning ai_allowance - ai_used into v_remaining;
    return coalesce(v_remaining, -1);
  end if;
  insert into public.company_ai_credits (company_id, balance) values (cid, 0)
    on conflict (company_id) do nothing;
  update public.company_ai_credits
    set balance = balance - 1, updated_at = now()
    where company_id = cid and balance > 0
    returning balance into v_remaining;
  if v_remaining is null then
    return -1;
  end if;
  insert into public.ai_credit_ledger (company_id, delta, reason) values (cid, -1, 'spend');
  return v_remaining;
end;
$$;

-- Give a demo login its credit back when the AI call failed. True when it was a demo login.
create or replace function public.refund_demo_ai_credit(cid uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  update public.demo_logins dl set ai_used = greatest(0, ai_used - 1)
    from public.demos d
   where d.id = dl.demo_id and dl.user_id = auth.uid() and d.company_id = cid
   returning dl.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.refund_demo_ai_credit(uuid) from public, anon;
grant execute on function public.refund_demo_ai_credit(uuid) to authenticated;

-- USAGE, ACTIVE TIME ONLY (Phil, popup): the page sends a beat about every 30 seconds while the
-- tab is visible and somebody has touched it in the last minute. Seconds are capped by the real
-- time since the last beat, so a replayed or hand made call cannot inflate the figures.
create or replace function public.demo_beat(p_session text, p_area text, p_seconds integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_login uuid;
  v_last timestamptz;
  v_credit integer;
  v_area text := coalesce(nullif(p_area, ''), 'other');
begin
  if p_session is null or length(p_session) > 100 then return; end if;
  if v_area !~ '^[a-z_]{1,40}$' then v_area := 'other'; end if;
  select dl.id into v_login
    from public.demo_logins dl join public.demos d on d.id = dl.demo_id
   where dl.user_id = auth.uid() and d.deleted_at is null and d.ends_at > now();
  if v_login is null then return; end if;

  select last_seen_at into v_last from public.demo_visits
   where login_id = v_login and session_id = p_session;
  if v_last is null then
    insert into public.demo_visits (login_id, session_id) values (v_login, p_session)
      on conflict (login_id, session_id) do nothing;
    return; -- the first beat opens the visit; time is counted from here
  end if;
  v_credit := least(greatest(coalesce(p_seconds, 0), 0), 60,
                    greatest(0, floor(extract(epoch from (now() - v_last)))::integer));
  update public.demo_visits
     set last_seen_at = now(), active_seconds = active_seconds + v_credit
   where login_id = v_login and session_id = p_session;
  if v_credit > 0 then
    insert into public.demo_area_time (login_id, area, seconds) values (v_login, v_area, v_credit)
      on conflict (login_id, area) do update set seconds = public.demo_area_time.seconds + excluded.seconds;
  end if;
end;
$$;
revoke all on function public.demo_beat(text, text, integer) from public, anon;
grant execute on function public.demo_beat(text, text, integer) to authenticated;

-- The feedback token for the signed in demo login (made once, idempotent).
create or replace function public.demo_feedback_token()
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_login uuid; v_demo uuid; v_token uuid;
begin
  select dl.id, dl.demo_id into v_login, v_demo from public.demo_logins dl
   where dl.user_id = auth.uid();
  if v_login is null then return null; end if;
  insert into public.demo_feedback (demo_id, login_id) values (v_demo, v_login)
    on conflict (login_id) do nothing;
  select token into v_token from public.demo_feedback where login_id = v_login;
  return v_token;
end;
$$;
revoke all on function public.demo_feedback_token() from public, anon;
grant execute on function public.demo_feedback_token() to authenticated;

-- What the no login survey page may know about a token: whether it is real and already answered.
create or replace function public.demo_feedback_status(p_token uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select jsonb_build_object('found', true, 'submitted', f.submitted_at is not null,
                               'first_name', split_part(coalesce(dl.full_name, ''), ' ', 1))
       from public.demo_feedback f left join public.demo_logins dl on dl.id = f.login_id
      where f.token = p_token),
    jsonb_build_object('found', false, 'submitted', false, 'first_name', ''));
$$;
revoke all on function public.demo_feedback_status(uuid) from public;
grant execute on function public.demo_feedback_status(uuid) to anon, authenticated;

-- Answer the survey once. Every rating 1 to 5; the three written answers optional.
create or replace function public.submit_demo_feedback(
  p_token uuid, p_ease smallint, p_looks smallint, p_registers smallint, p_forms smallint,
  p_reports smallint, p_overall smallint, p_likely smallint,
  p_liked text, p_disliked text, p_better text, p_via text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_token is null then return 'not_found'; end if;
  if least(p_ease, p_looks, p_registers, p_forms, p_reports, p_overall, p_likely) < 1
     or greatest(p_ease, p_looks, p_registers, p_forms, p_reports, p_overall, p_likely) > 5
     or p_ease is null or p_looks is null or p_registers is null or p_forms is null
     or p_reports is null or p_overall is null or p_likely is null then
    return 'invalid';
  end if;
  update public.demo_feedback
     set ease_of_use = p_ease, looks = p_looks, registers_checks = p_registers,
         forms_evidence = p_forms, reports = p_reports, overall = p_overall,
         likely_to_sign_up = p_likely,
         liked = nullif(left(btrim(coalesce(p_liked, '')), 4000), ''),
         disliked = nullif(left(btrim(coalesce(p_disliked, '')), 4000), ''),
         better = nullif(left(btrim(coalesce(p_better, '')), 4000), ''),
         submitted_at = now(),
         submitted_via = case when p_via = 'email' then 'email' else 'app' end
   where token = p_token and submitted_at is null
   returning id into v_id;
  if v_id is null then
    if exists (select 1 from public.demo_feedback where token = p_token) then return 'already'; end if;
    return 'not_found';
  end if;
  return 'ok';
end;
$$;
revoke all on function public.submit_demo_feedback(uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text) from public;
grant execute on function public.submit_demo_feedback(uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, text, text, text, text) to anon, authenticated;

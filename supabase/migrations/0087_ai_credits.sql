-- 0087_ai_credits
-- AI credit engine. One request (pressing an AI button) costs one credit. Companies
-- get a monthly grant by tier (Business 25, Pro 50), credits carry over until used,
-- and top-ups add more. Balance is the atomic source of truth; the ledger is the audit
-- trail. Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.company_ai_credits (
  company_id uuid primary key references public.companies(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  last_grant_month text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('monthly_grant','topup','spend','refund','adjustment')),
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_ledger_company_idx on public.ai_credit_ledger (company_id, created_at desc);

alter table public.company_ai_credits enable row level security;
alter table public.ai_credit_ledger enable row level security;

-- Members can see their balance; admins can see the ledger. All writes go through the
-- SECURITY DEFINER functions below (no direct insert/update policy).
create policy cac_select on public.company_ai_credits
  for select to authenticated using (public.is_company_member(company_id));
create policy acl_select on public.ai_credit_ledger
  for select to authenticated using (public.is_company_admin(company_id) or public.is_platform_admin());

-- Monthly credit allowance by tier.
create or replace function public.tier_monthly_ai_credits(t text)
returns integer language sql immutable as $$
  select case t
    when 'business' then 25
    when 'pro' then 50
    when 'enterprise' then 50
    when 'diamond' then 50
    when 'black' then 1000
    else 25 end;
$$;

-- Spend one credit for the caller's own company. Atomic (row lock via UPDATE).
-- Returns the remaining balance, or -1 when there are no credits to spend.
create or replace function public.spend_ai_credit(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_remaining integer;
begin
  if not public.is_company_member(cid) then
    raise exception 'spend_ai_credit: not a member of company %', cid;
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

-- Add credits (monthly grant, top-up, refund, adjustment). Service-role callers only.
create or replace function public.grant_ai_credits(cid uuid, amount integer, p_reason text, p_ref text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_balance integer;
begin
  if amount <= 0 then return (select balance from public.company_ai_credits where company_id = cid); end if;
  insert into public.company_ai_credits (company_id, balance) values (cid, amount)
    on conflict (company_id) do update set balance = public.company_ai_credits.balance + amount, updated_at = now()
    returning balance into v_balance;
  insert into public.ai_credit_ledger (company_id, delta, reason, ref) values (cid, amount, p_reason, p_ref);
  return v_balance;
end;
$$;

-- Grant this month's tier allowance to every active company that has not had it yet.
-- Idempotent per calendar month (last_grant_month gate). Service-role callers only.
create or replace function public.grant_monthly_ai_credits()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM'); v_count integer := 0; r record;
begin
  for r in
    select c.id, c.tier from public.companies c where c.status = 'active'
  loop
    insert into public.company_ai_credits (company_id, balance, last_grant_month)
      values (r.id, 0, null) on conflict (company_id) do nothing;
    if coalesce((select last_grant_month from public.company_ai_credits where company_id = r.id), '') <> v_month then
      update public.company_ai_credits
        set balance = balance + public.tier_monthly_ai_credits(r.tier),
            last_grant_month = v_month, updated_at = now()
        where company_id = r.id;
      insert into public.ai_credit_ledger (company_id, delta, reason, ref)
        values (r.id, public.tier_monthly_ai_credits(r.tier), 'monthly_grant', v_month);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.grant_ai_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_monthly_ai_credits() from public, anon, authenticated;
-- the cron and the refund path call these through the service-role client.
grant execute on function public.grant_ai_credits(uuid, integer, text, text) to service_role;
grant execute on function public.grant_monthly_ai_credits() to service_role;

-- Seed the current month's grant so existing companies can use AI now.
select public.grant_monthly_ai_credits();

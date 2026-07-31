-- 0159_sms_credits
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- SMS allowance, mirroring the AI credit engine in 0087. One SMS costs one credit. Companies get
-- a monthly grant by tier, unused credits carry over, top ups add more, and a company at zero
-- stops sending rather than running up a Twilio bill nobody agreed to.
--
-- BUNDLES (Phil, 2026-07-31): Business 0, Pro 100, Enterprise 250, Diamond 500, Black 2000. UK
-- SMS runs about 4p, so a Pro customer at full use costs roughly £4 a month against a £69 plan.
-- Escalation is rare by design, so most companies will not go near it.
--
-- WHY BUSINESS IS ZERO: sms_reminders is a Pro feature. The tier gate already refuses the send;
-- the zero allowance is the same rule expressed in the ledger, so nothing can leak through a
-- future caller that forgets to check the tier.

create table if not exists public.company_sms_credits (
  company_id uuid primary key references public.companies(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  last_grant_month text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('monthly_grant','topup','spend','refund','adjustment')),
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists sms_credit_ledger_company_idx on public.sms_credit_ledger (company_id, created_at desc);

alter table public.company_sms_credits enable row level security;
alter table public.sms_credit_ledger enable row level security;

-- Members can see the balance; admins and the founder can see the ledger. All writes go through
-- the SECURITY DEFINER functions below: there is deliberately no insert or update policy.
create policy csc_select on public.company_sms_credits
  for select to authenticated using (public.is_company_member(company_id));
create policy scl_select on public.sms_credit_ledger
  for select to authenticated using (public.is_company_admin(company_id) or public.is_platform_admin());

-- Monthly allowance by tier.
create or replace function public.tier_monthly_sms_credits(t text)
returns integer language sql immutable as $$
  select case t
    when 'business' then 0
    when 'pro' then 100
    when 'enterprise' then 250
    when 'diamond' then 500
    when 'black' then 2000
    else 0 end;
$$;

/*
 * Spend one credit. Atomic: the row lock is the UPDATE itself.
 *
 * Returns the remaining balance, or -1 when there was nothing to spend.
 *
 * Unlike spend_ai_credit this must also work for the SERVICE ROLE, because the daily digest cron
 * is what sends the escalation SMS and it has no auth.uid(). A signed in caller still has to be a
 * member of the company they are spending from.
 */
create or replace function public.spend_sms_credit(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_remaining integer;
begin
  if auth.uid() is not null and not public.is_company_member(cid) then
    raise exception 'spend_sms_credit: not a member of company %', cid;
  end if;
  insert into public.company_sms_credits (company_id, balance) values (cid, 0)
    on conflict (company_id) do nothing;
  update public.company_sms_credits
    set balance = balance - 1, updated_at = now()
    where company_id = cid and balance > 0
    returning balance into v_remaining;
  if v_remaining is null then
    return -1;
  end if;
  insert into public.sms_credit_ledger (company_id, delta, reason) values (cid, -1, 'spend');
  return v_remaining;
end;
$$;

-- Add credits (monthly grant, top up, refund, adjustment). Service role only.
create or replace function public.grant_sms_credits(cid uuid, amount integer, p_reason text, p_ref text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_balance integer;
begin
  if amount <= 0 then return (select balance from public.company_sms_credits where company_id = cid); end if;
  insert into public.company_sms_credits (company_id, balance) values (cid, amount)
    on conflict (company_id) do update set balance = public.company_sms_credits.balance + amount, updated_at = now()
    returning balance into v_balance;
  insert into public.sms_credit_ledger (company_id, delta, reason, ref) values (cid, amount, p_reason, p_ref);
  return v_balance;
end;
$$;

-- This month's allowance for every active company that has not had it yet. Idempotent per
-- calendar month via last_grant_month. Service role only.
create or replace function public.grant_monthly_sms_credits()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM'); v_count integer := 0; r record;
begin
  for r in
    select c.id, c.tier from public.companies c where c.status = 'active'
  loop
    insert into public.company_sms_credits (company_id, balance, last_grant_month)
      values (r.id, 0, null) on conflict (company_id) do nothing;
    if coalesce((select last_grant_month from public.company_sms_credits where company_id = r.id), '') <> v_month then
      update public.company_sms_credits
        set balance = balance + public.tier_monthly_sms_credits(r.tier),
            last_grant_month = v_month, updated_at = now()
        where company_id = r.id;
      -- A zero grant still stamps the month, so a Business company is not revisited every night,
      -- but it does NOT write a ledger line for nothing.
      if public.tier_monthly_sms_credits(r.tier) > 0 then
        insert into public.sms_credit_ledger (company_id, delta, reason, ref)
          values (r.id, public.tier_monthly_sms_credits(r.tier), 'monthly_grant', v_month);
      end if;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.grant_sms_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_monthly_sms_credits() from public, anon, authenticated;
grant execute on function public.grant_sms_credits(uuid, integer, text, text) to service_role;
grant execute on function public.grant_monthly_sms_credits() to service_role;
grant execute on function public.spend_sms_credit(uuid) to authenticated, service_role;

-- Seed this month so the allowance is live immediately.
select public.grant_monthly_sms_credits();

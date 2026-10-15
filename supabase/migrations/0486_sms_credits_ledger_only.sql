-- 0486: SMS credits move only through the ledger; Thistle's balances corrected; short SMS links
-- (Phil, 2026-10-15; docs/decisions/sms-one-segment.md).
--
-- 1. THISTLE'S BALANCES (Phil's popups "Correct the balance to 1,991" and "Correct the balance to
--    950"). Thistle's SMS balance was 3,991 against a ledger of 1,991, and its AI balance 998
--    against 950: its records before 16 Sep 2026 (the first real import) were cleared, ledger
--    rows included, and the balances were left. Each balance is set to what its ledger accounts
--    for. Nothing else is touched. Safe to run twice (it sets, it does not subtract).
--
-- 2. A BALANCE MOVES ONLY WITH A LEDGER ROW. The ledger is the only way in: inserting a ledger row
--    moves the balance (trigger), and any other change to a balance is refused (trigger). The three
--    functions that move credits keep their names, arguments, permissions and checks exactly; they
--    now write the ledger row and let it move the balance. Spending stays atomic (row lock) and
--    still refuses at zero.
--
-- 3. sms_credit_mismatches(): every company whose balance is not its ledger, for the Founder's
--    health page (platform admin only). The same for AI credits, which have no trigger yet.
--
-- 4. sms_links: the short links in texts, becarecompliant.com/s/<code> (8 characters from the
--    public forms' unambiguous alphabet). Each points at a path in the app and runs out with the
--    thing it points to. Service role only (no policies); the destination stays behind sign in.

-- ---------------------------------------------------------------------------------------------
-- 1. Thistle.
-- ---------------------------------------------------------------------------------------------
update public.company_sms_credits s
   set balance = coalesce((select sum(l.delta) from public.sms_credit_ledger l where l.company_id = s.company_id), 0),
       updated_at = now()
 where s.company_id = 'eae26e83-1e41-472b-abc0-e2b39b907e49'
   and s.balance <> coalesce((select sum(l.delta) from public.sms_credit_ledger l where l.company_id = s.company_id), 0);

update public.company_ai_credits a
   set balance = coalesce((select sum(l.delta) from public.ai_credit_ledger l where l.company_id = a.company_id), 0)
 where a.company_id = 'eae26e83-1e41-472b-abc0-e2b39b907e49'
   and a.balance <> coalesce((select sum(l.delta) from public.ai_credit_ledger l where l.company_id = a.company_id), 0);

-- ---------------------------------------------------------------------------------------------
-- 2. The ledger moves the balance; nothing else may.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sms_credit_ledger_apply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('bcc.sms_ledger_write', '1', true);
  insert into public.company_sms_credits (company_id, balance) values (new.company_id, 0)
    on conflict (company_id) do nothing;
  update public.company_sms_credits
     set balance = balance + new.delta, updated_at = now()
   where company_id = new.company_id;
  perform set_config('bcc.sms_ledger_write', '', true);
  return null;
end;
$$;
revoke all on function public.sms_credit_ledger_apply() from public, anon, authenticated;

drop trigger if exists sms_credit_ledger_apply on public.sms_credit_ledger;
create trigger sms_credit_ledger_apply
  after insert on public.sms_credit_ledger
  for each row execute function public.sms_credit_ledger_apply();

create or replace function public.company_sms_credits_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('bcc.sms_ledger_write', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' and coalesce(new.balance, 0) <> 0 then
    raise exception 'An SMS credit balance starts at 0 and moves only through the ledger (sms_credit_ledger).';
  end if;
  if tg_op = 'UPDATE' and new.balance is distinct from old.balance then
    raise exception 'An SMS credit balance moves only through the ledger (sms_credit_ledger).';
  end if;
  return new;
end;
$$;
revoke all on function public.company_sms_credits_guard() from public, anon, authenticated;

drop trigger if exists company_sms_credits_guard on public.company_sms_credits;
create trigger company_sms_credits_guard
  before insert or update on public.company_sms_credits
  for each row execute function public.company_sms_credits_guard();

-- Spend one credit: as before (who may, atomic, -1 at zero), the ledger row moves the balance.
create or replace function public.spend_sms_credit(cid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_balance integer;
  v_is_service boolean;
begin
  v_is_service :=
    coalesce(current_setting('role', true), '') = 'service_role'
    or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  if not v_is_service and not public.is_company_member(cid) then
    raise exception 'spend_sms_credit: not permitted for company %', cid;
  end if;
  insert into public.company_sms_credits (company_id, balance) values (cid, 0)
    on conflict (company_id) do nothing;
  select balance into v_balance from public.company_sms_credits where company_id = cid for update;
  if v_balance is null or v_balance <= 0 then
    return -1;
  end if;
  insert into public.sms_credit_ledger (company_id, delta, reason) values (cid, -1, 'spend');
  return v_balance - 1;
end;
$function$;

-- Add credits (grant, top up, refund, goodwill, adjustment): as before, idempotent on its reference.
create or replace function public.grant_sms_credits(cid uuid, amount integer, p_reason text, p_ref text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if amount <= 0 then return (select balance from public.company_sms_credits where company_id = cid); end if;
  -- Already granted against this reference (a redelivered webhook): return the balance untouched.
  if p_ref is not null and exists (
    select 1 from public.sms_credit_ledger
    where company_id = cid and reason = p_reason and ref = p_ref
  ) then
    return (select balance from public.company_sms_credits where company_id = cid);
  end if;
  insert into public.sms_credit_ledger (company_id, delta, reason, ref) values (cid, amount, p_reason, p_ref);
  return (select balance from public.company_sms_credits where company_id = cid);
end;
$function$;

-- This month's allowance: as before, once per company per month; the ledger row moves the balance.
create or replace function public.grant_monthly_sms_credits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM'); v_count integer := 0; v_amount integer; r record;
begin
  for r in
    select c.id, c.tier from public.companies c where c.status = 'active'
  loop
    insert into public.company_sms_credits (company_id, balance, last_grant_month)
      values (r.id, 0, null) on conflict (company_id) do nothing;
    v_amount := public.tier_monthly_sms_credits(r.tier);
    -- A zero grant does NOT stamp the month. Stamping it meant a Business company that upgraded
    -- to Pro mid month was already marked as granted and got no texts until the 1st.
    if v_amount > 0 and coalesce((select last_grant_month from public.company_sms_credits where company_id = r.id), '') <> v_month then
      update public.company_sms_credits
        set last_grant_month = v_month, updated_at = now()
        where company_id = r.id;
      insert into public.sms_credit_ledger (company_id, delta, reason, ref)
        values (r.id, v_amount, 'monthly_grant', v_month);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.spend_sms_credit(uuid) from public, anon, authenticated;
revoke all on function public.grant_sms_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.grant_monthly_sms_credits() from public, anon, authenticated;
grant execute on function public.spend_sms_credit(uuid) to service_role;
grant execute on function public.grant_sms_credits(uuid, integer, text, text) to service_role;
grant execute on function public.grant_monthly_sms_credits() to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Balances that do not match their ledger (the Founder's health page).
-- ---------------------------------------------------------------------------------------------
create or replace function public.credit_ledger_mismatches()
returns table (company_id uuid, company_name text, kind text, balance integer, ledger_sum bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name, 'sms', s.balance, coalesce(l.total, 0)
    from public.companies c
    join public.company_sms_credits s on s.company_id = c.id
    left join (select company_id, sum(delta) total from public.sms_credit_ledger group by company_id) l on l.company_id = c.id
   where public.is_platform_admin() and s.balance <> coalesce(l.total, 0)
  union all
  select c.id, c.name, 'ai', a.balance, coalesce(l.total, 0)
    from public.companies c
    join public.company_ai_credits a on a.company_id = c.id
    left join (select company_id, sum(delta) total from public.ai_credit_ledger group by company_id) l on l.company_id = c.id
   where public.is_platform_admin() and a.balance <> coalesce(l.total, 0);
$$;
revoke all on function public.credit_ledger_mismatches() from public, anon;
grant execute on function public.credit_ledger_mismatches() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Short links in texts.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.sms_links (
  code text primary key check (code ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{8}$'),
  company_id uuid references public.companies(id) on delete cascade,
  target_path text not null check (target_path like '/%' and target_path not like '//%'),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.sms_links is
  'Short links in texts (0486): becarecompliant.com/s/<code> opens target_path, which stays behind sign in. Service role only.';
create index if not exists sms_links_company_idx on public.sms_links (company_id);
alter table public.sms_links enable row level security;

select public.install_company_link_triggers();

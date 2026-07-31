-- 0160_sms_credits_lock_down_spend
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- THREE DEFECTS IN 0159, caught by review before anything shipped.
--
-- 1. SECURITY. spend_sms_credit was reachable by ANON and its guard was inverted for exactly that
--    caller. `if auth.uid() is not null and not is_company_member(cid)` skips the membership check
--    entirely for an unauthenticated caller, and Postgres grants EXECUTE to PUBLIC by default, so
--    `grant ... to authenticated, service_role` took nothing away. Anyone holding the browser anon
--    key and a company UUID could have called it in a loop and drained that company's whole SMS
--    allowance, silently killing its overdue escalations and pushing it into a top up.
--    The app never needed the authenticated grant: every send goes through the service client.
--    Revoked from public, anon and authenticated; granted to service_role only; and the guard is
--    now a hard membership check that only the service role may bypass.
--
-- 2. A zero grant stamped last_grant_month, so a Business company (0 texts) that upgraded to Pro
--    mid month was already stamped and got nothing until the 1st. Only a real grant stamps now.
--
-- 3. grant_sms_credits was not idempotent on its ref, so a redelivered Stripe webhook granted the
--    same top up twice. A partial unique index on (company_id, reason, ref) plus a check in the
--    function makes a repeat a no op.
--
-- NOTE for later: spend_ai_credit (0087) is still executable by anon. It is SAFE, because its
-- guard is `if not is_company_member(cid) then raise` and that fires for a caller with no
-- identity. Worth revoking anyway as defence in depth, in its own migration.

revoke execute on function public.spend_sms_credit(uuid) from public, anon, authenticated;
grant execute on function public.spend_sms_credit(uuid) to service_role;

create or replace function public.spend_sms_credit(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_remaining integer;
begin
  -- The nightly digest sends through the service role and has no auth.uid(). Everybody else must
  -- be a member of the company being charged. Written this way round on purpose: the previous
  -- version let a caller with NO identity straight through.
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and not public.is_company_member(cid) then
    raise exception 'spend_sms_credit: not permitted for company %', cid;
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
$fn$;

-- A top up is granted once per Stripe session, however many times the webhook is delivered.
create unique index if not exists sms_credit_ledger_ref_uidx
  on public.sms_credit_ledger (company_id, reason, ref)
  where ref is not null;

create or replace function public.grant_sms_credits(cid uuid, amount integer, p_reason text, p_ref text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_balance integer;
begin
  if amount <= 0 then return (select balance from public.company_sms_credits where company_id = cid); end if;
  if p_ref is not null and exists (
    select 1 from public.sms_credit_ledger
    where company_id = cid and reason = p_reason and ref = p_ref
  ) then
    return (select balance from public.company_sms_credits where company_id = cid);
  end if;
  insert into public.company_sms_credits (company_id, balance) values (cid, amount)
    on conflict (company_id) do update set balance = public.company_sms_credits.balance + amount, updated_at = now()
    returning balance into v_balance;
  insert into public.sms_credit_ledger (company_id, delta, reason, ref) values (cid, amount, p_reason, p_ref);
  return v_balance;
end;
$fn$;

create or replace function public.grant_monthly_sms_credits()
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM'); v_count integer := 0; v_amount integer; r record;
begin
  for r in
    select c.id, c.tier from public.companies c where c.status = 'active'
  loop
    insert into public.company_sms_credits (company_id, balance, last_grant_month)
      values (r.id, 0, null) on conflict (company_id) do nothing;
    v_amount := public.tier_monthly_sms_credits(r.tier);
    if v_amount > 0 and coalesce((select last_grant_month from public.company_sms_credits where company_id = r.id), '') <> v_month then
      update public.company_sms_credits
        set balance = balance + v_amount, last_grant_month = v_month, updated_at = now()
        where company_id = r.id;
      insert into public.sms_credit_ledger (company_id, delta, reason, ref)
        values (r.id, v_amount, 'monthly_grant', v_month);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$fn$;

revoke execute on function public.grant_sms_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_monthly_sms_credits() from public, anon, authenticated;
grant execute on function public.grant_sms_credits(uuid, integer, text, text) to service_role;
grant execute on function public.grant_monthly_sms_credits() to service_role;

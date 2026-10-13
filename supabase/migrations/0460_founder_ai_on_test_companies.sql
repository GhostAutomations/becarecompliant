-- 0460: the Founder may use AI in support mode on a TEST company (Phil, 2026-10-13, popup "Allow it
-- for test companies only"), so AI features can be tested on Bevan or Demo without a company login.
--
-- WHY. spend_ai_credit refuses anyone who is not a member of the company, so the Founder managing a
-- company can never spend its credits (DEF-103: support work must not spend a customer's credits).
-- That stays exactly so for every real customer. Only a company marked is_test (Bevan, Demo; the
-- flag only the Founder can change, companies_guard_founder_columns) lets the Founder spend.
--
-- Everything else in the function is as it was (demo login allowance, the balance, the ledger).
-- Safe to run twice.

create or replace function public.spend_ai_credit(cid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_remaining integer;
  v_login uuid;
begin
  if not public.is_company_member(cid)
     and not (public.is_platform_admin()
              and exists (select 1 from public.companies c where c.id = cid and c.is_test)) then
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
$function$;

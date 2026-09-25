-- 0332 Texts can be paid for again (found live 2026-09-25, the first real send).
--
-- The first text Be Care Compliant ever tried to send, a Return to Work link on Bevan, failed with
-- "spend_sms_credit: not permitted for company ...". Every send goes through the service client,
-- and 0160's guard recognised the service role by current_setting('request.jwt.claim.role'). That
-- is the OLD per claim setting: current PostgREST only sets request.jwt.claims (one JSON value),
-- and this project's service key is an sb_secret key, so the old setting is empty and the guard
-- took the service role for a stranger. No text could ever have been charged, so none could ever
-- have been sent: nothing noticed because Twilio was only switched on today.
--
-- The service role is now recognised three ways, any one of which is enough: the role PostgREST
-- switched to for this request (SET ROLE, which a SECURITY DEFINER function does not change), the
-- role in the JSON claims, and the old setting for anything still on it. Everyone else must still
-- be a member of the company being charged, and EXECUTE stays with service_role only (0160), so
-- anon and signed in users still cannot reach it at all.

create or replace function public.spend_sms_credit(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_remaining integer;
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

revoke execute on function public.spend_sms_credit(uuid) from public, anon, authenticated;
grant execute on function public.spend_sms_credit(uuid) to service_role;

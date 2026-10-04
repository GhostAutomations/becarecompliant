-- Audit Lows, database part (4 Oct 2026).

-- S8. seed_requirement_map could be run by anyone, even signed out, for any company id. Only its
-- two triggers need it, and they run as the owner (seed_requirement_map_on_change is SECURITY
-- DEFINER), so nobody else needs to be able to call it.
revoke execute on function public.seed_requirement_map(uuid) from public, anon, authenticated;

-- S12. A login could change its own profiles.email (the address the app emails and shows, which
-- should only ever follow the sign in address) and switch itself to another of the company's own
-- roles. Email now changes only from the server (no signed in caller) or the Founder; the
-- company's own role only by a Company Admin, and never on your own row, like role and status.
create or replace function public.enforce_profile_protected_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Only Be Care Compliant can move a login to another company.'
      using errcode = '42501';
  end if;

  if new.role = 'platform_admin' and old.role is distinct from 'platform_admin' then
    raise exception 'Not allowed to change role, company or status'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'An email address follows the sign in address and cannot be changed here.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.company_role_id is distinct from old.company_role_id then
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or status.'
        using errcode = '42501';
    end if;
    if not (old.company_id is not null and public.is_company_admin(old.company_id)) then
      raise exception 'Not allowed to change role, company or status'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- S15. Pin search_path on the six functions the Supabase advisor flagged.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.company_name_key(text) set search_path = public, pg_temp;
alter function public.on_call_log_finalised_is_locked() set search_path = public, pg_temp;
alter function public.settle_kept_training_booking() set search_path = public, pg_temp;
alter function public.tier_monthly_ai_credits(text) set search_path = public, pg_temp;
alter function public.tier_monthly_sms_credits(text) set search_path = public, pg_temp;

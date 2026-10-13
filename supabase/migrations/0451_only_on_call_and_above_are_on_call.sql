-- 0451: only On Call, Supervisors and above can be the person on call (Phil, 2026-10-13, popups:
-- "it lets me choose gethin lloyd as a on call person, it shouldnt. only on call and above";
-- "On Call, Supervisors and above"; "Yes, enforce in the database").
--
-- The rota's person picker offered every active login, carers included. The screen now offers only
-- these roles (lib/on-call/rota-access.ts ON_CALL_PERSON_ROLES), and this trigger refuses anybody
-- else however the shift is saved: a carer, a Senior or a Viewer, or a login that is not active.
-- Checked only when the person on a shift is set or changed, so a shift already on file is never
-- blocked from being cleared or read.
--
-- Safe to run twice.

create or replace function public.guard_on_call_person()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.on_call_profile_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.on_call_profile_id is not distinct from old.on_call_profile_id then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.on_call_profile_id
      and p.company_id = new.company_id
      and p.status = 'active'
      and p.role in ('company_admin', 'registered_individual', 'registered_manager',
                     'manager', 'supervisor', 'recruiter', 'on_call')
  ) then
    raise exception 'Only an active On Call, Supervisor, Manager or Admin login can be on call.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_on_call_person() from public, anon, authenticated;

drop trigger if exists guard_on_call_person on public.on_call_shifts;
create trigger guard_on_call_person
  before insert or update on public.on_call_shifts
  for each row execute function public.guard_on_call_person();

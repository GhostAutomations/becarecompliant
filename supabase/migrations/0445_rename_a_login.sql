-- 0445: changing a login's name (Phil, 2026-10-12, docs/decisions/login-names.md).
--
-- A name can be corrected (a spelling mistake) or changed (marriage) on Settings, Users, by a
-- Company Admin for any login in their own company, or by the Founder in support mode. Nobody
-- else, not even for their own name, and never the Founder's own login.
--
-- 1. THE NAME IS LOCKED. Until now nothing guarded profiles.full_name: RLS lets a login update its
--    own row, and the protected fields trigger checked role, status, company and email but not the
--    name, so any login could rename itself behind the screens. Now a signed in caller can change
--    it only through rename_login below, which raises a transaction local flag around its one
--    update. The server key (invites, the Welcome screen, demos) and the Founder are let through
--    exactly as before, by the two early returns already at the top of the trigger.
--
-- 2. rename_login(login, new name, also change the People record) does the whole job in one
--    transaction: the login, its pending invite (so resent invite emails and the Welcome screen
--    use the new name), the linked Person when asked (the tick box, ticked by default), the live
--    working copies of the name that later emails read (open support tickets, pending holiday
--    requests), the staff dropdowns baked into forms ("Conducted by"), and the audit row with the
--    old and the new name.
--
--    What it never touches: Evidence (author_name, answers, schema_snapshot), letters already
--    sent, approved policy covers, legal acceptances and every history entry. They keep the name
--    as it was at the time.

create or replace function public.enforce_profile_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_platform_admin() then return new; end if;
  if new.company_id is distinct from old.company_id then
    raise exception 'Only Be Care Compliant can move a login to another company.' using errcode = '42501';
  end if;
  if new.role = 'platform_admin' and old.role is distinct from 'platform_admin' then
    raise exception 'Not allowed to change role, company or status' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'An email address follows the sign in address and cannot be changed here.' using errcode = '42501';
  end if;
  -- 0445: the name changes only through rename_login, which checks who is asking and logs it.
  if new.full_name is distinct from old.full_name
     and coalesce(current_setting('bcc.login_rename', true), '') <> 'on' then
    raise exception 'A name is changed by an Admin on Settings, Users.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status
     or new.company_role_id is distinct from old.company_role_id then
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or status.' using errcode = '42501';
    end if;
    if not (old.company_id is not null and public.is_company_admin(old.company_id)) then
      raise exception 'Not allowed to change role, company or status' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.rename_login(
  p_profile_id uuid,
  p_full_name text,
  p_also_person boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_new text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_old text;
  v_founder boolean;
  v_person_id uuid;
  v_person_old text;
  v_person_renamed boolean := false;
  v_invites int := 0;
  v_tickets int := 0;
  v_holidays int := 0;
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  select * into v_actor from public.profiles where id = v_uid;
  v_founder := public.is_platform_admin();

  select * into v_target from public.profiles where id = p_profile_id for update;
  if not found or v_target.company_id is null then
    raise exception 'That login was not found.' using errcode = 'P0002';
  end if;
  if v_target.role = 'platform_admin' then
    raise exception 'The Founder login cannot be renamed here.' using errcode = '42501';
  end if;
  if not (v_founder or public.is_company_admin(v_target.company_id)) then
    raise exception 'Only an Admin of this company can change a name.' using errcode = '42501';
  end if;
  if not v_founder and public.is_demo_company(v_target.company_id) then
    raise exception 'Logins cannot be changed in a demo.' using errcode = '42501';
  end if;
  if v_new = '' then
    raise exception 'Enter a name.' using errcode = '22023';
  end if;
  if length(v_new) > 120 then
    raise exception 'Keep the name to 120 characters or fewer.' using errcode = '22023';
  end if;

  v_old := v_target.full_name;
  select id, full_name into v_person_id, v_person_old
    from public.people
   where profile_id = p_profile_id and company_id = v_target.company_id
   order by created_at
   limit 1;

  -- Nothing to do: saving the same name twice changes nothing and logs nothing.
  if v_new = v_old and (not coalesce(p_also_person, false) or v_person_id is null or v_person_old = v_new) then
    return jsonb_build_object('changed', false, 'old_name', v_old, 'new_name', v_new,
                              'person_renamed', false, 'invites_updated', 0);
  end if;

  if v_new is distinct from v_old then
    perform set_config('bcc.login_rename', 'on', true);
    update public.profiles set full_name = v_new where id = p_profile_id;
    perform set_config('bcc.login_rename', '', true);

    -- A pending invite carries its own copy, read by Resend and the Welcome screen.
    update public.invites
       set full_name = v_new
     where company_id = v_target.company_id
       and lower(email) = lower(v_target.email)
       and status = 'pending';
    get diagnostics v_invites = row_count;

    -- An open support ticket reuses the name it was raised under in every email it sends.
    update public.support_tickets
       set raised_by_name = v_new
     where raised_by = p_profile_id
       and resolved_at is null
       and raised_by_name = v_old;
    get diagnostics v_tickets = row_count;
  end if;

  if coalesce(p_also_person, false) and v_person_id is not null and v_person_old is distinct from v_new then
    update public.people set full_name = v_new where id = v_person_id;
    v_person_renamed := true;
  end if;

  -- A holiday request still waiting for a decision names its requester in the emails it sends.
  update public.holiday_requests
     set requester_name = v_new
   where company_id = v_target.company_id
     and status = 'pending'
     and (
       (requested_by = p_profile_id and requester_name = v_old)
       or (v_person_renamed and person_id = v_person_id and requester_name = v_person_old)
     );
  get diagnostics v_holidays = row_count;

  -- The "Conducted by" style dropdowns baked into the company's forms list logins by name.
  perform public.rebake_form_field_options(v_target.company_id);

  if v_new is distinct from v_old then
  insert into public.audit_log
    (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
  values (
    v_target.company_id, v_uid, v_actor.email, v_actor.role,
    'user.renamed', 'profile', p_profile_id::text,
    format('Changed the name %s to %s', v_old, v_new),
    jsonb_build_object(
      'old_name', v_old,
      'new_name', v_new,
      'person_id', v_person_id,
      'person_old_name', v_person_old,
      'person_renamed', v_person_renamed,
      'invites_updated', v_invites,
      'tickets_updated', v_tickets,
      'holiday_requests_updated', v_holidays
    ) || case when v_founder
              then jsonb_build_object('impersonating', true, 'acting_company_id', v_target.company_id)
              else '{}'::jsonb end
  );
  end if;
  if v_person_renamed then
    insert into public.audit_log
      (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
    values (
      v_target.company_id, v_uid, v_actor.email, v_actor.role,
      'person.updated', 'person', v_person_id::text,
      format('Changed the name %s to %s, with their login', v_person_old, v_new),
      jsonb_build_object('old_name', v_person_old, 'new_name', v_new, 'profile_id', p_profile_id)
        || case when v_founder
                then jsonb_build_object('impersonating', true, 'acting_company_id', v_target.company_id)
                else '{}'::jsonb end
    );
  end if;

  return jsonb_build_object(
    'changed', true,
    'old_name', v_old,
    'new_name', v_new,
    'person_renamed', v_person_renamed,
    'invites_updated', v_invites
  );
end;
$$;

revoke all on function public.rename_login(uuid, text, boolean) from public, anon;
grant execute on function public.rename_login(uuid, text, boolean) to authenticated;

-- 0447: a job title on each office login, for the sign off of its letters (Phil, 2026-10-12,
-- docs/decisions/letter-editor-whole-page.md).
--
-- No office login had a People record with a job title, so after Part C (job title never the
-- system role) every letter printed the signer's name alone. Phil chose: an Admin sets each
-- login's job title on Settings, Users. Blank means the name alone, as now.
--
-- 1. profiles.job_title: up to 80 characters, null when blank.
-- 2. LOCKED like the name (0445): a login cannot change its own job title behind the screens. A
--    signed in caller changes it only through set_login_job_title, which raises a transaction
--    local flag around its one update. The server key and the Founder pass as before.
-- 3. set_login_job_title(login, title): a Company Admin for logins in their own company, or the
--    Founder in support mode; never the Founder's own login, never in a demo. Audit logged with the
--    old and new title. Saving the same title twice changes and logs nothing.

alter table public.profiles add column if not exists job_title text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_job_title_length' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_job_title_length check (job_title is null or (length(job_title) between 1 and 80));
  end if;
end $$;

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
  -- 0447: the job title changes only through set_login_job_title, the same way.
  if new.job_title is distinct from old.job_title
     and coalesce(current_setting('bcc.login_job_title', true), '') <> 'on' then
    raise exception 'A job title is changed by an Admin on Settings, Users.' using errcode = '42501';
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

create or replace function public.set_login_job_title(
  p_profile_id uuid,
  p_job_title text
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
  v_new text := nullif(regexp_replace(btrim(coalesce(p_job_title, '')), '\s+', ' ', 'g'), '');
  v_founder boolean;
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
    raise exception 'The Founder login has no job title here.' using errcode = '42501';
  end if;
  if not (v_founder or public.is_company_admin(v_target.company_id)) then
    raise exception 'Only an Admin of this company can change a job title.' using errcode = '42501';
  end if;
  if not v_founder and public.is_demo_company(v_target.company_id) then
    raise exception 'Logins cannot be changed in a demo.' using errcode = '42501';
  end if;
  if v_new is not null and length(v_new) > 80 then
    raise exception 'Keep the job title to 80 characters or fewer.' using errcode = '22023';
  end if;

  if v_new is not distinct from v_target.job_title then
    return jsonb_build_object('changed', false, 'job_title', v_new);
  end if;

  perform set_config('bcc.login_job_title', 'on', true);
  update public.profiles set job_title = v_new where id = p_profile_id;
  perform set_config('bcc.login_job_title', '', true);

  insert into public.audit_log
    (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
  values (
    v_target.company_id, v_uid, v_actor.email, v_actor.role,
    'user.job_title_changed', 'profile', p_profile_id::text,
    case
      when v_new is null then format('Removed the job title of %s (was %s)', v_target.full_name, v_target.job_title)
      when v_target.job_title is null then format('Set the job title of %s to %s', v_target.full_name, v_new)
      else format('Changed the job title of %s from %s to %s', v_target.full_name, v_target.job_title, v_new)
    end,
    jsonb_build_object('old_job_title', v_target.job_title, 'new_job_title', v_new)
      || case when v_founder
              then jsonb_build_object('impersonating', true, 'acting_company_id', v_target.company_id)
              else '{}'::jsonb end
  );

  return jsonb_build_object('changed', true, 'job_title', v_new);
end;
$$;

revoke all on function public.set_login_job_title(uuid, text) from public, anon;
grant execute on function public.set_login_job_title(uuid, text) to authenticated;

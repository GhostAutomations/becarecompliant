-- 0134_person_login_status.sql
-- "Does this carer have a login yet?" on the Person record.
--
-- profiles_select and invites_select are both COMPANY ADMIN only, so a Branch
-- Manager, who is exactly the person adding carers, cannot read either. Rather
-- than widen those policies (profiles carry roles and statuses for the whole
-- company), this returns the few facts the Person record needs, to anyone who
-- can already manage that Person.
--
-- No email address and no name comes back: the caller is looking at the record
-- that holds those anyway, and a narrow return is a narrow blast radius.

create or replace function public.person_login_status(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_branch uuid;
  v_profile uuid;
  v_email text;
  v_status text;
  v_role text;
  v_invited timestamptz;
  v_invite_status text;
begin
  select company_id, branch_id, profile_id, work_email
  into v_company, v_branch, v_profile, v_email
  from public.people where id = p_person_id;
  if v_company is null then return null; end if;

  if not (
    public.is_platform_admin()
    or public.is_company_wide(v_company)
    or public.is_branch_manager(v_branch)
  ) then
    raise exception 'You do not have permission to view this';
  end if;

  if v_profile is not null then
    select status, role into v_status, v_role
    from public.profiles where id = v_profile;
  end if;

  if v_email is not null and btrim(v_email) <> '' then
    select created_at, status into v_invited, v_invite_status
    from public.invites
    where company_id = v_company and lower(email) = lower(btrim(v_email))
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'has_email', v_email is not null and btrim(v_email) <> '',
    'has_login', v_profile is not null,
    'login_status', v_status,
    'login_role', v_role,
    'invited_at', v_invited,
    'invite_status', v_invite_status
  );
end;
$$;

revoke all on function public.person_login_status(uuid) from public, anon;
grant execute on function public.person_login_status(uuid) to authenticated;

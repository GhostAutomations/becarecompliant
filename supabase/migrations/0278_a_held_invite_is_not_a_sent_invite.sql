-- A HELD INVITE IS NOT A SENT INVITE.
--
-- The bulk import has a "don't send their Team Member logins yet" tick, which creates the
-- login and deliberately leaves the email unsent: invites.email_sent_at stays NULL and
-- Settings > Users correctly reads it as "Not sent yet". The Person record was reading the
-- invite's created_at instead, so a held invite announced "Sent <today>, not opened yet".
-- An administrator holding thirteen invites was told all thirteen had gone out.
--
-- Returns email_sent_at alongside, so the record can say what actually happened. invited_at
-- keeps its meaning (when the invite was raised) because the button's wording reads from it.
create or replace function public.person_login_status(p_person_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
  v_branch uuid;
  v_profile uuid;
  v_email text;
  v_status text;
  v_role text;
  v_invited timestamptz;
  v_email_sent timestamptz;
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
    select created_at, email_sent_at, status
    into v_invited, v_email_sent, v_invite_status
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
    'email_sent_at', v_email_sent,
    'invite_status', v_invite_status
  );
end;
$function$;

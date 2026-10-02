-- 0368 — Agreement and payment are gates, not jobs (Phil, 2026-10-02: "accept the agreement and
-- add payment should already be green, they should not be able to mark done or not needed").
--
-- The Admin meets both at first sign in (the agreement, then the payment page), so on the card they
-- tick themselves and carry no buttons for anyone. Both RPCs now refuse them. get_setup_status also
-- returns agreement_required (the agreement counts as done where the gate is off for the company)
-- and is_test (a test company is never billed, so payment counts as done).

create or replace function public.set_setup_step(p_company uuid, p_step text, p_not_needed boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not (public.is_platform_admin() or public.is_company_admin(p_company)) then
    raise exception 'Only the company''s Admin can change its set up list';
  end if;
  if p_step in ('agreement', 'payment') then
    raise exception 'The agreement and payment tick themselves when the company completes them';
  end if;
  if p_step !~ '^(branch:[0-9a-f-]{36}|[a-z_]{2,40})$' then
    raise exception 'Unknown set up step';
  end if;
  if p_not_needed then
    insert into public.company_setup_steps (company_id, step_key, state, by)
    values (p_company, p_step, 'not_needed', auth.uid())
    on conflict (company_id, step_key) do nothing;
  else
    delete from public.company_setup_steps
    where company_id = p_company and step_key = p_step and state = 'not_needed';
  end if;
end;
$$;

create or replace function public.founder_set_setup_step(p_company uuid, p_step text, p_done boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Be Care Compliant can tick set up steps for a company';
  end if;
  if p_step in ('agreement', 'payment') then
    raise exception 'The agreement and payment tick themselves when the company completes them';
  end if;
  if p_step !~ '^(branch:[0-9a-f-]{36}|[a-z_]{2,40})$' then
    raise exception 'Unknown set up step';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company and c.deleted_at is null) then
    raise exception 'That company could not be found';
  end if;
  if p_done then
    insert into public.company_setup_steps (company_id, step_key, state, by, at)
    values (p_company, p_step, 'done', auth.uid(), now())
    on conflict (company_id, step_key) do update
      set state = 'done', by = excluded.by, at = excluded.at
      where public.company_setup_steps.state <> 'done';
  else
    delete from public.company_setup_steps st
    where st.company_id = p_company and st.step_key = p_step and st.state = 'done'
      and exists (select 1 from public.profiles fp where fp.id = st.by and fp.role = 'platform_admin');
  end if;
end;
$$;

create or replace function public.get_setup_status(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  -- service_role: the daily 10 day alert (cron) reads it with the service client.
  if not (public.is_platform_admin() or public.is_company_admin(p_company) or auth.role() = 'service_role') then
    raise exception 'Only the company''s Admin can see its set up list';
  end if;

  select jsonb_build_object(
    'tier', c.tier,
    'agreement_required', c.agreement_required,
    'is_test', c.is_test,
    'regulator', c.regulator,
    'has_logo', c.logo_path is not null,
    'trial_live', c.trial_ends_at is not null and c.trial_ends_at > now(),
    'subscription_status', (select b.subscription_status from public.company_billing b where b.company_id = c.id),
    'agreement_accepted', exists (select 1 from public.agreement_acceptances a where a.company_id = c.id),
    'people', (select count(*) from public.people p where p.company_id = c.id and p.archived_at is null),
    'service_users', (select count(*) from public.service_users s where s.company_id = c.id and s.archived_at is null),
    'training_records', (select count(*) from public.person_training t where t.company_id = c.id),
    'policies', (select count(*) from public.company_policies cp where cp.company_id = c.id),
    'managers', (select count(*) from public.profiles pr
                 where pr.company_id = c.id
                   and pr.role in ('manager', 'registered_manager', 'registered_individual')
                   and pr.status <> 'disabled')
              + (select count(*) from public.invites i
                 where i.company_id = c.id
                   and i.role in ('manager', 'registered_manager', 'registered_individual')
                   and i.status = 'pending'),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name) order by br.name)
                          from public.branches br
                          where br.company_id = c.id and br.kind = 'branch' and br.status = 'active'), '[]'::jsonb),
    'steps', coalesce((select jsonb_object_agg(st.step_key, st.state)
                       from public.company_setup_steps st where st.company_id = c.id), '{}'::jsonb),
    'founder_ticked', coalesce((select jsonb_agg(st.step_key)
                                from public.company_setup_steps st
                                join public.profiles fp on fp.id = st.by and fp.role = 'platform_admin'
                                where st.company_id = c.id and st.state = 'done'), '[]'::jsonb)
  ) into v
  from public.companies c
  where c.id = p_company;

  return v;
end;
$$;

-- 0367 — Getting set up, round 2 (Phil, 2026-10-01, agreed by popup).
--
-- 1. THE FOUNDER CAN TICK STEPS OFF. Every step except the agreement, which is always the
--    customer's own acceptance. A founder tick is a 'done' row whose "by" is a platform admin;
--    get_setup_status lists those keys as founder_ticked so the card can say so and offer Undo.
--    Undo removes only a founder's tick, never a stamp the Admin earned by saving a page.
-- 2. THE 10 DAY ALERT. Ten days after a company is created, if set up is not finished, the founder
--    gets ONE alert (Founder Inbox and email). companies.setup_alert_at records that the 10 day
--    check has been made (alert sent, or not needed because set up was finished), so it is never
--    repeated. Companies that existed before this went live are stamped now, so the first run does
--    not alert on every older company at once.

alter table public.companies add column if not exists setup_alert_at timestamptz;
comment on column public.companies.setup_alert_at is
  'When the 10 day Getting set up check was made for this company (alert sent or not needed). Null = still to check.';
update public.companies set setup_alert_at = now() where setup_alert_at is null;

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
  if p_step = 'agreement' then
    raise exception 'The agreement can only be accepted by the company itself';
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

revoke execute on function public.founder_set_setup_step(uuid, text, boolean) from public, anon;
grant execute on function public.founder_set_setup_step(uuid, text, boolean) to authenticated, service_role;

-- Same read as 0366, plus founder_ticked, and readable by the service role for the cron.
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

-- 0366 — The "Getting set up" card (Phil, 2026-10-01, agreed by popup).
--
-- A Company Admin sees a card on their dashboard listing the set up steps; the founder sees the
-- same ticks on the founder company page. Every company gets it, existing ones too. Steps the
-- data can show tick by themselves (get_setup_status). Steps the data cannot show (each branch's
-- registered setting, check settings, forms, notifications) tick the first time that settings
-- page is saved: the server action writes a 'done' stamp here with the service client, after its
-- own permission check. Any step can be marked Not needed by the Admin or the founder.

create table if not exists public.company_setup_steps (
  company_id uuid not null references public.companies(id) on delete cascade,
  step_key text not null check (step_key ~ '^(branch:[0-9a-f-]{36}|[a-z_]{2,40})$'),
  state text not null check (state in ('done', 'not_needed')),
  at timestamptz not null default now(),
  by uuid,
  primary key (company_id, step_key)
);

alter table public.company_setup_steps enable row level security;

create policy company_setup_steps_select on public.company_setup_steps
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

-- Not needed, or undo it. Admin of that company, or the founder. A 'done' stamp is never
-- cleared here: undoing Not needed removes only a not_needed row.
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

-- Everything the card needs in one read, whatever the caller's role can normally see.
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
  if not (public.is_platform_admin() or public.is_company_admin(p_company)) then
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
                       from public.company_setup_steps st where st.company_id = c.id), '{}'::jsonb)
  ) into v
  from public.companies c
  where c.id = p_company;

  return v;
end;
$$;

revoke execute on function public.set_setup_step(uuid, text, boolean), public.get_setup_status(uuid) from public, anon;
grant execute on function public.set_setup_step(uuid, text, boolean), public.get_setup_status(uuid) to authenticated, service_role;

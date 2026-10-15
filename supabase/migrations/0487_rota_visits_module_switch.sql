-- 0487 Rota and Visits (beta), Stage 0: the per company module switch (Phil, 2026-10-15).
--
-- ADDITIVE ONLY (the job's speed and safety guard): one new table and two new functions. No
-- existing table, policy, trigger or function is altered, and nothing joins the realtime
-- publication.
--
-- company_modules holds one row per company per module. No row, or enabled = false, means off,
-- so every company is off by default. Turning a module off keeps every row of its data: each
-- module table's RLS asks company_module_on(), so the data is hidden, not deleted.
--
-- Only the Founder can change a switch, through set_company_module (SECURITY DEFINER, checks
-- is_platform_admin inside). The table has no insert, update or delete policy, so nobody writes
-- it directly. The app reads the switch inside the company row it already loads (an embed on
-- the same request, lib/companies/row.ts), so no page makes an extra round trip for it.

create table if not exists public.company_modules (
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('rota_visits')),
  enabled boolean not null default false,
  -- Who last changed it. No foreign key: the Founder's profile has no company, and the full
  -- record of every change is in audit_log.
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (company_id, module)
);

alter table public.company_modules enable row level security;

drop policy if exists company_modules_select on public.company_modules;
create policy company_modules_select on public.company_modules
  for select to authenticated
  using (company_id = (select public.my_company_id()) or (select public.is_platform_admin()));

-- Is this module on for this company? For the RLS of every module table, and the RPCs.
create or replace function public.company_module_on(p_company uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.enabled from public.company_modules m
      where m.company_id = p_company and m.module = p_module),
    false);
$$;

revoke all on function public.company_module_on(uuid, text) from public, anon;
grant execute on function public.company_module_on(uuid, text) to authenticated;

-- Founder only: switch a module on or off for a company. Returns the new state.
create or replace function public.set_company_module(p_company uuid, p_module text, p_enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the Founder can switch modules on or off.' using errcode = '42501';
  end if;
  if p_module not in ('rota_visits') then
    raise exception 'Unknown module.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company) then
    raise exception 'That company could not be found.' using errcode = 'P0002';
  end if;

  insert into public.company_modules (company_id, module, enabled, changed_by, changed_at)
  values (p_company, p_module, coalesce(p_enabled, false), auth.uid(), now())
  on conflict (company_id, module)
  do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at;

  return coalesce(p_enabled, false);
end;
$$;

revoke all on function public.set_company_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_company_module(uuid, text, boolean) to authenticated;

-- Records stay in their own company (0443).
select public.install_company_link_triggers();

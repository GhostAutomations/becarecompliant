-- Be Care Compliant 0510: cancellation reasons and rules (Rota and Visits Stage 7b part 2b, Phil's
-- popups 2026-10-17; docs/decisions/rota-visits.md, call cancellations 2 and 3, Stage 7b 6, 9, 16).
--
-- Reasons: each company's own list, A to Z with Other last (typed), each saying whether a short
-- notice cancellation for that reason is still charged and whether the carer is still paid. Seeded
-- with Phil's list: hospital, respite, service user cancelled and family cancelled charged and paid;
-- the rest not. Other is always there and cannot be archived.
--
-- Rules: a notice period, how long a short notice cancellation is still charged and how long the
-- carer is still paid, in hours. One per funder (company wide) and one default per branch; with no
-- row a branch uses 48, 48 and 48 hours (decision 16). rota_cancel_rule_for(branch, funder) answers
-- which applies: the funder's own, else the branch's, else the default.
--
-- Company level tables (reasons, funder rules) carry no branch; branch defaults carry the branch.
-- Nothing existing changes.

create table if not exists public.rota_cancel_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text check (code is null or code ~ '^[a-z_]{2,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  chargeable boolean not null default false,
  carer_paid boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  check (not (code = 'other' and archived_at is not null))
);
create unique index if not exists rota_cancel_reasons_label on public.rota_cancel_reasons (company_id, lower(btrim(label)));
create unique index if not exists rota_cancel_reasons_code on public.rota_cancel_reasons (company_id, code) where code is not null;
create index if not exists rota_cancel_reasons_created_by on public.rota_cancel_reasons (created_by);

create table if not exists public.rota_cancel_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  funder_id uuid references public.funders(id) on delete cascade,
  notice_hours integer not null check (notice_hours between 0 and 720),
  charge_hours integer not null check (charge_hours between 0 and 2016),
  pay_hours integer not null check (pay_hours between 0 and 2016),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check ((branch_id is null) <> (funder_id is null))
);
create unique index if not exists rota_cancel_rules_branch on public.rota_cancel_rules (branch_id) where branch_id is not null;
create unique index if not exists rota_cancel_rules_funder on public.rota_cancel_rules (funder_id) where funder_id is not null;
create index if not exists rota_cancel_rules_company on public.rota_cancel_rules (company_id);
create index if not exists rota_cancel_rules_updated_by on public.rota_cancel_rules (updated_by);

alter table public.rota_cancel_reasons enable row level security;
alter table public.rota_cancel_rules enable row level security;
drop policy if exists rota_cancel_reasons_select on public.rota_cancel_reasons;
create policy rota_cancel_reasons_select on public.rota_cancel_reasons
  for select to authenticated
  using ((select public.is_company_member(company_id)) or (select public.is_platform_admin()));
drop policy if exists rota_cancel_reasons_write on public.rota_cancel_reasons;
create policy rota_cancel_reasons_write on public.rota_cancel_reasons
  for all to authenticated
  using ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()))
  with check ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()));
drop policy if exists rota_cancel_rules_select on public.rota_cancel_rules;
create policy rota_cancel_rules_select on public.rota_cancel_rules
  for select to authenticated
  using ((select public.is_company_member(company_id)) or (select public.is_platform_admin()));
drop policy if exists rota_cancel_rules_write on public.rota_cancel_rules;
create policy rota_cancel_rules_write on public.rota_cancel_rules
  for all to authenticated
  using ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()))
  with check ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()));

-- Puts Phil's reasons on a company that has none yet. Safe to run twice. A signed in caller must be
-- a member of the company (or the Founder); the migration and jobs run it with no caller.
create or replace function public.rota_cancel_reasons_ensure(p_company uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not (public.is_company_member(p_company) or public.is_platform_admin()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if exists (select 1 from public.rota_cancel_reasons where company_id = p_company) then return; end if;
  insert into public.rota_cancel_reasons (company_id, code, label, chargeable, carer_paid)
  values
    (p_company, 'carer_unavailable', 'Carer unavailable, no cover found', false, false),
    (p_company, 'family_cancelled', 'Family cancelled', true, true),
    (p_company, 'office_error', 'Office error', false, false),
    (p_company, 'su_cancelled', 'Service user cancelled', true, true),
    (p_company, 'su_deceased', 'Service user deceased', false, false),
    (p_company, 'su_hospital', 'Service user in hospital', true, true),
    (p_company, 'su_respite', 'Service user in respite', true, true),
    (p_company, 'visit_moved', 'Visit moved to another time', false, false),
    (p_company, 'other', 'Other', false, false)
  on conflict do nothing;
end;
$$;
revoke all on function public.rota_cancel_reasons_ensure(uuid) from public, anon;
grant execute on function public.rota_cancel_reasons_ensure(uuid) to authenticated, service_role;

-- The rule for a visit: the funder's own, else the branch's, else 48, 48, 48 hours (decision 16).
-- Runs as the caller (RLS shows a member their own company's rules).
create or replace function public.rota_cancel_rule_for(p_branch uuid, p_funder uuid)
returns table (notice_hours integer, charge_hours integer, pay_hours integer, source text)
language sql
stable
set search_path = public, pg_temp
as $$
  select x.nh, x.ch, x.ph, x.src from (
    select r.notice_hours as nh, r.charge_hours as ch, r.pay_hours as ph, 'funder'::text as src, 1 as o
      from public.rota_cancel_rules r where p_funder is not null and r.funder_id = p_funder
    union all
    select r.notice_hours, r.charge_hours, r.pay_hours, 'branch'::text, 2
      from public.rota_cancel_rules r where r.branch_id = p_branch
    union all
    select 48, 48, 48, 'default'::text, 3
  ) x
  order by x.o
  limit 1;
$$;
revoke all on function public.rota_cancel_rule_for(uuid, uuid) from public, anon;
grant execute on function public.rota_cancel_rule_for(uuid, uuid) to authenticated, service_role;

-- Companies already using Rota and Visits get their reasons now.
select public.rota_cancel_reasons_ensure(cm.company_id)
  from public.company_modules cm where cm.module = 'rota_visits' and cm.enabled;

select public.install_company_link_triggers();

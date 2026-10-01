-- 0363 Readiness per branch (Phil, 2026-10-01, after Thistle's two CIW reports: Cardiff and Gwent
-- are inspected as separate services). Applied to the becarecompliant Supabase project ONLY
-- (ref bgrtcvyjuwopunpnudeu).
--
-- 1. branches.registered_service: "Registered with CIW (or CQC) as its own service". On by
--    default; the office (team) branch starts off, so it is left out of readiness.
-- 2. branch_inspections: each branch's inspections, with the regulator's rating per theme.
-- 3. inspection_notices.branch_id: a notice belongs to the service it was issued to.
-- 4. framework_readiness_snapshots.branch_id: the trend is per branch.
-- 5. get_framework_check_readiness takes a branch (null = every branch, as before).

-- 1 -------------------------------------------------------------------------------------------
alter table public.branches add column if not exists registered_service boolean not null default true;
update public.branches set registered_service = false where kind = 'team';

create or replace function public.branches_team_not_registered()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind = 'team' then
    new.registered_service := false;
  end if;
  return new;
end;
$$;
drop trigger if exists branches_team_not_registered on public.branches;
create trigger branches_team_not_registered
  before insert on public.branches
  for each row execute function public.branches_team_not_registered();

-- 2 -------------------------------------------------------------------------------------------
create table if not exists public.branch_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  regulator text not null check (regulator in ('ciw', 'cqc')),
  inspected_on date not null,
  published_on date,
  -- { "<requirement code>": "excellent" | "good" | "requires_improvement" | "requires_significant_improvement"
  --   (CIW) or "outstanding" | "good" | "requires_improvement" | "inadequate" (CQC) }
  ratings jsonb not null default '{}'::jsonb check (jsonb_typeof(ratings) = 'object'),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (published_on is null or published_on >= inspected_on)
);
create index if not exists branch_inspections_branch_idx on public.branch_inspections (branch_id, inspected_on desc);
create index if not exists branch_inspections_company_idx on public.branch_inspections (company_id);

alter table public.branch_inspections enable row level security;

drop policy if exists branch_inspections_select on public.branch_inspections;
create policy branch_inspections_select on public.branch_inspections for select
  using (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id));

drop policy if exists branch_inspections_insert on public.branch_inspections;
create policy branch_inspections_insert on public.branch_inspections for insert
  with check (
    (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
    and exists (select 1 from public.branches b where b.id = branch_id and b.company_id = branch_inspections.company_id)
  );

drop policy if exists branch_inspections_update on public.branch_inspections;
create policy branch_inspections_update on public.branch_inspections for update
  using (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
  with check (
    (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
    and exists (select 1 from public.branches b where b.id = branch_id and b.company_id = branch_inspections.company_id)
  );

drop policy if exists branch_inspections_delete on public.branch_inspections;
create policy branch_inspections_delete on public.branch_inspections for delete
  using (public.is_platform_admin() or public.is_company_wide(company_id));

-- 3 -------------------------------------------------------------------------------------------
alter table public.inspection_notices
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists inspection_notices_branch_idx on public.inspection_notices (branch_id);

drop policy if exists inspection_notices_insert on public.inspection_notices;
create policy inspection_notices_insert on public.inspection_notices for insert
  with check (
    (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
    and (branch_id is null or exists (select 1 from public.branches b where b.id = branch_id and b.company_id = inspection_notices.company_id))
  );
drop policy if exists inspection_notices_update on public.inspection_notices;
create policy inspection_notices_update on public.inspection_notices for update
  using (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
  with check (
    (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
    and (branch_id is null or exists (select 1 from public.branches b where b.id = branch_id and b.company_id = inspection_notices.company_id))
  );

-- 4 -------------------------------------------------------------------------------------------
alter table public.framework_readiness_snapshots
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.framework_readiness_snapshots
  drop constraint if exists framework_readiness_snapshots_company_id_regulator_requirem_key;
alter table public.framework_readiness_snapshots
  drop constraint if exists framework_readiness_snapshots_scope_key;
alter table public.framework_readiness_snapshots
  add constraint framework_readiness_snapshots_scope_key
  unique nulls not distinct (company_id, regulator, branch_id, requirement_code, captured_on);

-- 5 -------------------------------------------------------------------------------------------
drop function if exists public.get_framework_check_readiness(uuid, text);
drop function if exists public.get_framework_check_readiness(uuid, text, uuid);

create function public.get_framework_check_readiness(p_company uuid, p_regulator text, p_branch uuid default null)
returns table(
  requirement_id uuid,
  overdue integer,
  due_soon integer,
  on_track integer,
  total integer,
  unscheduled integer,
  waiting_sup3 integer,
  waiting_appraisal integer,
  waiting_probation integer
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           ci.due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber,
           ( ci.last_completed_on is not null
             and ( cd.recurring = false or ci.due_date <= ci.last_completed_on ) ) as settled,
           case
             when ci.due_date is not null then 'dated'
             when cd.schedule_mode = 'ad_hoc' then 'ad_hoc'
             when ci.record_type = 'person' and cd.key = 'appraisal'
                  and cd.schedule_mode = 'after_sup3' then 'wait_sup3'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and ci.last_completed_on is not null then 'wait_appraisal'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and t.probation_end_actual is null
                  and not exists (
                    select 1
                    from public.check_instances a
                    join public.check_definitions ad on ad.id = a.definition_id and ad.key = 'appraisal'
                    where a.person_id = ci.person_id and a.last_completed_on is not null
                  ) then 'wait_probation'
             else 'unscheduled'
           end as bucket
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
    left join public.person_trackers t on t.person_id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status = 'active' and pe.archived_at is null)
         or (ci.record_type = 'service_user' and su.service_status = 'active' and su.archived_at is null) )
      -- The record's OWN branch, so a transferred person counts where they work now.
      and ( p_branch is null or coalesce(pe.branch_id, su.branch_id) = p_branch )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and not settled and due_date < current_date)::int as overdue,
    count(*) filter (where due_date is not null and not settled and due_date >= current_date and due_date <= current_date + amber)::int as due_soon,
    count(*) filter (where due_date is not null and (settled or due_date > current_date + amber))::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    count(*) filter (where bucket = 'unscheduled')::int as unscheduled,
    count(*) filter (where bucket = 'wait_sup3')::int as waiting_sup3,
    count(*) filter (where bucket = 'wait_appraisal')::int as waiting_appraisal,
    count(*) filter (where bucket = 'wait_probation')::int as waiting_probation
  from inst
  group by requirement_id;
$function$;

revoke all on function public.get_framework_check_readiness(uuid, text, uuid) from public, anon;
grant execute on function public.get_framework_check_readiness(uuid, text, uuid) to authenticated;

-- 0008_person_trackers
-- Phase 3 change (Phil, 2026-07-08): the People register mirrors his Monday board.
-- DBS + Enhanced DBS dates, Right to Work (expiry + limits) and Probation (end due,
-- end actual, status, extension) are RECORDED fields, edited directly on a carer's
-- record (no form), shown as register columns. Every carer gets a tracker row
-- (auto-created on person insert). Supervision Sup 1/2/3 and the recurring checks
-- stay in check_instances; those three slots are derived in the app from the
-- Supervision interval (Settings) and the completion history.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table public.person_trackers (
  person_id uuid primary key references public.people(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  dbs_date date,
  enhanced_dbs_date date,
  rtw_expiry_date date,
  rtw_limits text check (rtw_limits in ('none','20hrs_term','20hrs_2nd_job','visa_expires')),
  probation_end_due date,
  probation_end_actual date,
  probation_status text check (probation_status in ('passed','failed','extended','due')),
  probation_extension_date date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index person_trackers_company_idx on public.person_trackers (company_id);
create index person_trackers_branch_idx on public.person_trackers (branch_id);

create trigger person_trackers_set_updated_at
  before update on public.person_trackers
  for each row execute function public.set_updated_at();

-- Auto-create a tracker row whenever a Person is created.
create or replace function public.create_person_tracker()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.person_trackers (person_id, company_id, branch_id)
  values (new.id, new.company_id, new.branch_id)
  on conflict (person_id) do nothing;
  return new;
end;
$$;

create trigger people_create_tracker
  after insert on public.people
  for each row execute function public.create_person_tracker();

-- Keep the tracker's branch in step on transfer (extends the existing sync).
create or replace function public.sync_check_instance_branch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.branch_id is distinct from old.branch_id then
    update public.check_instances
      set branch_id = new.branch_id, updated_at = now()
      where person_id = new.id;
    update public.person_trackers
      set branch_id = new.branch_id
      where person_id = new.id;
  end if;
  return new;
end;
$$;

-- Backfill tracker rows for any existing Records.
insert into public.person_trackers (person_id, company_id, branch_id)
select p.id, p.company_id, p.branch_id from public.people p
on conflict (person_id) do nothing;

-- RLS: read follows the Person's visibility (same shape as check_instances_select);
-- write is Managers/Admins (can_manage_person). No delete (rows follow the person).
alter table public.person_trackers enable row level security;

create policy person_trackers_select on public.person_trackers
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (branch_id is not null and public.is_branch_team_member(branch_id))
    or public.is_person_supervisor(person_id)
    or exists (
      select 1 from public.people pe
      where pe.id = person_trackers.person_id and pe.profile_id = auth.uid()
    )
  );

create policy person_trackers_insert on public.person_trackers
  for insert with check (public.can_manage_person(person_id));

create policy person_trackers_update on public.person_trackers
  for update using (public.can_manage_person(person_id))
  with check (public.can_manage_person(person_id));

alter table public.person_trackers replica identity full;
alter publication supabase_realtime add table public.person_trackers;

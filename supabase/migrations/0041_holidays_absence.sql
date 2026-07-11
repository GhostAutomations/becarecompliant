-- 0041_holidays_absence
-- People extension: Holidays & Absence sub-sections (nested under People).
-- Lifecycle/log model, NOT the recurring Check/RAG model.
--   absence_config   : per-company tracking method (stages | bradford), rolling
--                      window, thresholds, uploaded policy + AI suggestion.
--   holiday_requests : a staff holiday request (pending/approved/declined).
--   absence_events   : a logged absence for a Person (manager-recorded).
--   absence_meetings : a formal absence-management meeting (Stage 1..4).
-- Evidence is written through the EXISTING founder forms (holiday_requests,
-- holiday_response, absence_back_office, absence_management_meeting) via
-- submit_evidence(record_type='person', record_id=person_id); these tables just
-- hold the status/dates/stage and link back to the evidence row(s).
-- RLS mirrors Phase 3 People: is_branch_manager / is_person_supervisor /
-- is_company_admin / own (requested_by = auth.uid() or people.profile_id).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- absence_config — one row per company. Drives how absence is tracked.
-- ===========================================================================
create table if not exists public.absence_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  method text not null default 'stages' check (method in ('stages', 'bradford')),
  rolling_window_days int not null default 365,
  -- stages:   [{ "stage":1, "label":"Stage 1", "occasions":3, "days":8 }, ...]
  -- bradford: [{ "threshold":51, "action":"Informal discussion" }, ...]
  thresholds jsonb not null default '[]'::jsonb,
  policy_path text,
  policy_uploaded_at timestamptz,
  policy_ai_summary text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.absence_config enable row level security;

create policy absence_config_select on public.absence_config
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy absence_config_write on public.absence_config
  for all to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- holiday_requests — a staff holiday request.
-- ===========================================================================
create table if not exists public.holiday_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  requester_name text,
  start_date date not null,
  end_date date not null,
  hours numeric,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  request_evidence_id uuid references public.evidence(id) on delete set null,
  decision_evidence_id uuid references public.evidence(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index holiday_requests_company_idx on public.holiday_requests (company_id, status);
create index holiday_requests_branch_idx on public.holiday_requests (branch_id);
create index holiday_requests_person_idx on public.holiday_requests (person_id);
create index holiday_requests_requester_idx on public.holiday_requests (requested_by);

alter table public.holiday_requests enable row level security;

-- Read: platform / company admin / branch manager / caseload supervisor / own
-- (own = I made the request, or it is against my own linked Person record).
create policy holiday_requests_select on public.holiday_requests
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (person_id is not null and public.is_person_supervisor(person_id))
    or requested_by = auth.uid()
    or exists (
      select 1 from public.people pe
      where pe.id = holiday_requests.person_id and pe.profile_id = auth.uid()
    )
  );

-- Insert: a company member may create their OWN request; a manager/admin may
-- create one for their branch. Decisions (approve/decline) go through the RPC.
create policy holiday_requests_insert on public.holiday_requests
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      requested_by = auth.uid()
      or public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
    )
  );

-- Approve / decline a holiday request. SECURITY DEFINER, guarded by the
-- request's own branch/company (not just membership) per the JCN gotcha.
create or replace function public.decide_holiday_request(
  p_id uuid,
  p_status text,
  p_evidence_id uuid default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_branch uuid;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'decide_holiday_request: invalid status %', p_status;
  end if;
  select company_id, branch_id into v_company, v_branch
  from public.holiday_requests where id = p_id;
  if v_company is null then
    raise exception 'decide_holiday_request: request not found';
  end if;
  if not (
    public.is_platform_admin()
    or public.is_company_admin(v_company)
    or (v_branch is not null and public.is_branch_manager(v_branch))
  ) then
    raise exception 'decide_holiday_request: not authorised';
  end if;
  update public.holiday_requests
    set status = p_status,
        decision_evidence_id = coalesce(p_evidence_id, decision_evidence_id),
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
    where id = p_id;
end;
$$;

grant execute on function public.decide_holiday_request(uuid, text, uuid, text) to authenticated;

-- ===========================================================================
-- absence_events — a logged absence for a Person (manager/admin recorded).
-- ===========================================================================
create table if not exists public.absence_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  person_id uuid not null references public.people(id) on delete cascade,
  start_date date not null,
  end_date date,
  return_date date,
  days numeric,
  reason text,
  evidence_id uuid references public.evidence(id) on delete set null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index absence_events_company_idx on public.absence_events (company_id);
create index absence_events_branch_idx on public.absence_events (branch_id);
create index absence_events_person_idx on public.absence_events (person_id, start_date);

alter table public.absence_events enable row level security;

create policy absence_events_select on public.absence_events
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or public.is_person_supervisor(person_id)
    or exists (
      select 1 from public.people pe
      where pe.id = absence_events.person_id and pe.profile_id = auth.uid()
    )
  );

create policy absence_events_insert on public.absence_events
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
    )
  );

-- ===========================================================================
-- absence_meetings — a formal absence-management meeting (Stage 1..4).
-- ===========================================================================
create table if not exists public.absence_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  person_id uuid not null references public.people(id) on delete cascade,
  stage int check (stage between 1 and 4),
  meeting_date date,
  evidence_id uuid references public.evidence(id) on delete set null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index absence_meetings_company_idx on public.absence_meetings (company_id);
create index absence_meetings_person_idx on public.absence_meetings (person_id, meeting_date);

alter table public.absence_meetings enable row level security;

create policy absence_meetings_select on public.absence_meetings
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or public.is_person_supervisor(person_id)
    or exists (
      select 1 from public.people pe
      where pe.id = absence_meetings.person_id and pe.profile_id = auth.uid()
    )
  );

create policy absence_meetings_insert on public.absence_meetings
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
    )
  );

-- ===========================================================================
-- person_absence_summary — per-Person aggregates over the company's rolling
-- window, for the Absence view (only active people who HAVE absences appear).
-- security_invoker so the caller's RLS on absence_events + people scopes it
-- (a Manager sees only their branch). The stage / Bradford mapping itself is
-- computed in the TS module lib/absence, mirroring the recurrence-engine split.
-- ===========================================================================
create or replace view public.person_absence_summary
with (security_invoker = on) as
with ev as (
  select
    ae.company_id,
    ae.person_id,
    ae.branch_id,
    ae.start_date,
    coalesce(ae.end_date, ae.start_date) as end_date,
    coalesce(ae.days, (coalesce(ae.end_date, ae.start_date) - ae.start_date) + 1) as days
  from public.absence_events ae
  left join public.absence_config cfg on cfg.company_id = ae.company_id
  where ae.start_date >= current_date
    - ((coalesce(cfg.rolling_window_days, 365))::text || ' days')::interval
)
select
  pe.company_id,
  pe.id as person_id,
  pe.full_name,
  pe.branch_id,
  count(ev.*)::int as occasions,
  coalesce(sum(ev.days), 0) as total_days,
  min(ev.start_date) as first_absence,
  max(ev.end_date) as last_absence,
  (
    select max(am.stage) from public.absence_meetings am
    where am.person_id = pe.id and am.company_id = pe.company_id
  ) as latest_meeting_stage
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;

grant select on public.person_absence_summary to authenticated;

-- ===========================================================================
-- Private storage bucket for uploaded absence policies (folder = company_id).
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('absence-policies', 'absence-policies', false)
on conflict (id) do nothing;

create policy absence_policies_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'absence-policies'
    and (
      public.is_platform_admin()
      or public.is_company_member(((storage.foldername(name))[1])::uuid)
    )
  );

create policy absence_policies_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'absence-policies'
    and (
      public.is_platform_admin()
      or public.is_company_admin(((storage.foldername(name))[1])::uuid)
    )
  );

create policy absence_policies_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'absence-policies'
    and (
      public.is_platform_admin()
      or public.is_company_admin(((storage.foldername(name))[1])::uuid)
    )
  );

create policy absence_policies_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'absence-policies'
    and (
      public.is_platform_admin()
      or public.is_company_admin(((storage.foldername(name))[1])::uuid)
    )
  );

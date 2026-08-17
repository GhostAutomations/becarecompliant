-- 0206  An approved holiday is approved by somebody who may approve it
--
-- Three findings from impersonating all eight roles against production RLS.
--
-- ONE. The INSERT policy on holiday_requests checked company membership and
-- nothing else. It never looked at `status`, so any member of a company could
-- insert a row that was already approved, for anybody, in any branch. Proved as
-- a Viewer, the read only role: an approved month of holiday for a named
-- colleague in a branch that account has no connection to, which would have
-- landed on the branch holiday calendar. The rule that a Supervisor's booking
-- stays pending lived in one line of JavaScript in bookHolidayForPerson. A rule
-- that must always hold belongs where a second write path cannot walk around it.
--
-- TWO. can_manage_holiday_request reached a Responsible Individual and a
-- Registered Manager only through is_branch_manager, which is guarded by
-- `branch_id is not null`. So a company wide role could decide any request that
-- carried a branch and none that did not, while an Admin could decide both. A
-- request comes out branch less whenever the requester has no Person branch and
-- no primary branch row, which is the ordinary state for a Registered Manager
-- booking their own leave. They could not even see it. Same shape as 0203.
--
-- THREE. decide_holiday_request never looked at the status it was overwriting,
-- though cancel and amend both do. Proved as Admin: cancel an approved holiday
-- and immediately re approve it, and the row ends up approved with a
-- cancelled_at timestamp still on it, and the requester is emailed twice. The
-- screen only ever offers Approve and Decline on a pending request, so the
-- database now says the same thing the screen does.

-- ---------------------------------------------------------------------------
-- Who may approve, expressed once, taking the two columns rather than a row id
-- so the insert trigger can ask about a row that does not exist yet.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_holiday(p_company uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    public.is_platform_admin()
    -- company_admin, registered_individual, registered_manager: company wide,
    -- so a branch less request is theirs to decide as much as a branch one is.
    or public.is_company_wide(p_company)
    or (p_branch is not null and public.is_branch_manager(p_branch));
$$;

grant execute on function public.can_manage_holiday(uuid, uuid) to authenticated;

create or replace function public.can_manage_holiday_request(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid; v_branch uuid;
begin
  select company_id, branch_id into v_company, v_branch
  from public.holiday_requests where id = p_id;
  if v_company is null then return false; end if;
  return public.can_manage_holiday(v_company, v_branch);
end;
$$;

-- ---------------------------------------------------------------------------
-- The status a writer may set on a new row
-- ---------------------------------------------------------------------------
create or replace function public.holiday_request_status_is_earned()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- No JWT means the service role or direct SQL, which is the back end acting
  -- for somebody it has already identified. Same convention as
  -- enforce_profile_protected_fields. This trigger guards the browser.
  if auth.uid() is null then
    return new;
  end if;

  -- A holiday names a person, and the name goes on a calendar. The policy only
  -- checks the company, so without this a member of one company could hang a
  -- row off a person in another.
  if new.person_id is not null
     and not exists (
       select 1 from public.people pe
       where pe.id = new.person_id and pe.company_id = new.company_id
     ) then
    raise exception 'That person is not in this company.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from 'pending' then
    if not public.can_manage_holiday(new.company_id, new.branch_id) then
      raise exception 'You do not have permission to book this holiday as already approved.'
        using errcode = 'check_violation';
    end if;
    -- The decision is stamped with whoever is actually writing it, so a
    -- forged decided_by cannot put somebody else's name on the outcome.
    new.decided_by := auth.uid();
    new.decided_at := coalesce(new.decided_at, now());
  else
    -- A pending row carries no decision and no cancellation, whatever it was
    -- sent with.
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists holiday_requests_status_is_earned on public.holiday_requests;
create trigger holiday_requests_status_is_earned
  before insert on public.holiday_requests
  for each row execute function public.holiday_request_status_is_earned();

-- ---------------------------------------------------------------------------
-- A decision lands on a pending request, once
-- ---------------------------------------------------------------------------
create or replace function public.decide_holiday_request(
  p_id uuid, p_status text, p_evidence_id uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid; v_branch uuid; v_status text;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'decide_holiday_request: invalid status %', p_status;
  end if;

  select company_id, branch_id, status into v_company, v_branch, v_status
  from public.holiday_requests where id = p_id;
  if v_company is null then raise exception 'That request could not be found.'; end if;

  if not public.can_manage_holiday(v_company, v_branch) then
    raise exception 'You do not have permission to decide this holiday.';
  end if;

  if v_status is distinct from 'pending' then
    raise exception 'That request has already been %.', v_status
      using errcode = 'check_violation';
  end if;

  update public.holiday_requests
    set status = p_status,
        decision_evidence_id = coalesce(p_evidence_id, decision_evidence_id),
        decided_by = auth.uid(), decided_at = now(), decision_note = p_note
    where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The policies say the same thing as the functions
-- ---------------------------------------------------------------------------
drop policy if exists holiday_requests_select on public.holiday_requests;
create policy holiday_requests_select on public.holiday_requests
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (person_id is not null and public.is_person_supervisor(person_id))
    or requested_by = auth.uid()
    or exists (
      select 1 from public.people pe
      where pe.id = holiday_requests.person_id and pe.profile_id = auth.uid()
    )
  );

drop policy if exists holiday_requests_insert on public.holiday_requests;
create policy holiday_requests_insert on public.holiday_requests
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (requested_by = auth.uid() or public.can_manage_holiday(company_id, branch_id))
  );

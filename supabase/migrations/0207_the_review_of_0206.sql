-- 0207  The review of 0206
--
-- 0206 was reviewed after it was applied and six things came back. Five are in
-- this file; the sixth was in the app.
--
-- ONE, and the only one that matters. The trigger checks that person_id belongs
-- to company_id and says nothing about branch_id, though the argument for the
-- first is word for word the argument for the second. Any member of a company
-- could insert a pending row carrying ANOTHER company's branch_id, and that row
-- is then visible and decidable to that other company's Branch Managers through
-- is_branch_manager(branch_id). Every screen filters on company_id, so it would
-- never render for them, but a row of one company's business sitting inside
-- another company's authority is exactly the hole 0206 exists to close.
--
-- TWO. decided_at was defaulted rather than stamped, so a client could post an
-- approved holiday decided last year while decided_by was correctly forced to
-- the real writer. Both are stamped now.
--
-- THREE. The pending branch stripped decision_note and not decision_evidence_id,
-- which is the same pre-stamped decision artefact.
--
-- FOUR. An insert of status 'cancelled' took the decision branch and wrote
-- decided_by and decided_at, leaving cancelled_by and cancelled_at empty. No
-- screen does this; a bulk import would.
--
-- FIVE. can_manage_holiday was granted to authenticated without first revoking
-- the default EXECUTE that every new function in public gets. It returns false
-- for anon, so nothing leaked, but 0126 and 0130 both revoke first and this
-- should read the same.
--
-- ALSO WORTH SAYING, and not said in 0206: rewriting can_manage_holiday_request
-- to delegate widens CANCEL and AMEND as well as decide, because both call it.
-- A Responsible Individual and a Registered Manager can now cancel and amend any
-- holiday in their company, branch or no branch. That is the intent, and it is
-- what the Holiday page has always offered them, but 0206 only discussed decide.

create or replace function public.holiday_request_status_is_earned()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- No JWT means the service role or direct SQL, which is the back end acting
  -- for somebody it has already identified. This trigger guards the browser.
  if auth.uid() is null then
    return new;
  end if;

  -- A holiday names a person and hangs off a branch, and both go on a calendar.
  -- The policy only checks the company, so without these a member of one company
  -- could hang a row off another company's person, or inside another company's
  -- branch, where that company's Branch Managers would then own it.
  if new.person_id is not null
     and not exists (
       select 1 from public.people pe
       where pe.id = new.person_id and pe.company_id = new.company_id
     ) then
    raise exception 'That person is not in this company.'
      using errcode = 'check_violation';
  end if;

  if new.branch_id is not null
     and not exists (
       select 1 from public.branches b
       where b.id = new.branch_id and b.company_id = new.company_id
     ) then
    raise exception 'That branch is not in this company.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'pending' then
    -- A pending row carries no decision and no cancellation, whatever it was
    -- sent with.
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.decision_evidence_id := null;
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
    return new;
  end if;

  -- Anything else is a row that arrives already settled, which is a decision,
  -- and a decision is earned.
  if not public.can_manage_holiday(new.company_id, new.branch_id) then
    raise exception 'You do not have permission to book this holiday as already approved.'
      using errcode = 'check_violation';
  end if;

  -- Stamped with whoever is actually writing it, so a forged decided_by cannot
  -- put somebody else's name on the outcome and a forged decided_at cannot
  -- backdate it. A row that arrives cancelled gets the cancellation columns
  -- rather than the decision ones.
  if new.status = 'cancelled' then
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
    new.decided_by := null;
    new.decided_at := null;
  else
    new.decided_by := auth.uid();
    new.decided_at := now();
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

revoke all on function public.can_manage_holiday(uuid, uuid) from public, anon;
grant execute on function public.can_manage_holiday(uuid, uuid) to authenticated;

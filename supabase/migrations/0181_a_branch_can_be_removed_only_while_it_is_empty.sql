-- =============================================================================
-- 0181 — a branch can be removed, but ONLY while it is empty.
--
-- Phil, 2026-08-13: the founder console can add a branch and nothing anywhere can remove
-- one. Provision a branch by mistake and the customer pays £7.50 a month for ever.
--
-- WHY THIS IS NOT A PLAIN DELETE. The foreign keys onto branches are a mix of three rules,
-- and two of them lose regulatory records silently:
--   * CASCADE  — reg73_visits, reg80_reviews, user_branches. Deleting a branch would DELETE
--                the statutory Regulation 73 visits and Regulation 80 quality reviews held
--                against it. Those are the artefacts an inspector asks for.
--   * SET NULL — incidents, evidence, check_instances, holiday_requests, whistleblowing and
--                more. The rows survive but forget which branch they belong to, which is
--                worse than useless in a report broken down by branch.
--   * RESTRICT — people, complaints, invoices, planner_bookings, on_call. Postgres refuses.
-- So the database will happily let a founder erase Reg 73 and Reg 80 history. It must not.
--
-- The rule: removal is an UNDO for a branch created by mistake, never a way to erase history.
-- If ANY row anywhere references the branch, removal is refused and the founder is told what
-- is in the way. The check and the delete happen in ONE function so nothing can be inserted
-- between them.
--
-- Measured on Acme the day this was written: Cardiff1 would have cascaded away 7 Regulation
-- 80 reviews and 6 Regulation 73 visits. Only the branch created minutes earlier was empty.
-- =============================================================================

-- What is standing in the way of removing this branch, most numerous first.
create or replace function public.branch_blocking_references(p_branch uuid)
returns table (what text, n bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select w, c from (
    select 'people'::text as w, count(*) as c from public.people where branch_id = p_branch
    union all select 'service users', count(*) from public.service_users where branch_id = p_branch
    union all select 'users assigned to it', count(*) from public.user_branches where branch_id = p_branch
    union all select 'invites', count(*) from public.invites where branch_id = p_branch
    union all select 'checks', count(*) from public.check_instances where branch_id = p_branch
    union all select 'evidence', count(*) from public.evidence where branch_id = p_branch
    union all select 'complaints', count(*) from public.complaints where branch_id = p_branch
    union all select 'complaint responses', count(*) from public.complaint_responses where branch_id = p_branch
    union all select 'incidents', count(*) from public.incidents where branch_id = p_branch
    union all select 'whistleblowing disclosures', count(*) from public.whistleblowing_disclosures where branch_id = p_branch
    union all select 'holiday requests', count(*) from public.holiday_requests where branch_id = p_branch
    union all select 'absence events', count(*) from public.absence_events where branch_id = p_branch
    union all select 'absence meetings', count(*) from public.absence_meetings where branch_id = p_branch
    union all select 'planner bookings', count(*) from public.planner_bookings where branch_id = p_branch
    union all select 'Regulation 73 visits', count(*) from public.reg73_visits where branch_id = p_branch
    union all select 'Regulation 80 reviews', count(*) from public.reg80_reviews where branch_id = p_branch
    union all select 'on call shifts', count(*) from public.on_call_shifts where branch_id = p_branch
    union all select 'on call logs', count(*) from public.on_call_logs where branch_id = p_branch
    union all select 'invoices', count(*) from public.invoices where branch_id = p_branch
    union all select 'invoice schedules', count(*) from public.invoice_schedules where branch_id = p_branch
    union all select 'person trackers', count(*) from public.person_trackers where branch_id = p_branch
    union all select 'service user trackers', count(*) from public.service_user_trackers where branch_id = p_branch
    union all select 'training records', count(*) from public.person_training where branch_id = p_branch
    union all select 'migrated completions', count(*) from public.migrated_completions where branch_id = p_branch
    union all select 'public form submissions', count(*) from public.public_form_submissions where branch_id = p_branch
    union all select 'notifications', count(*) from public.notification_log where branch_id = p_branch
  ) t(w, c)
  where c > 0
  order by c desc, w asc;
$$;

revoke all on function public.branch_blocking_references(uuid) from public, anon;
grant execute on function public.branch_blocking_references(uuid) to authenticated, service_role;

-- Remove an operational branch, refusing unless it is completely unused.
-- Returns jsonb: { removed: bool, reason: text|null, blocked_by: [{what, n}], name: text }.
create or replace function public.remove_unused_branch(p_branch uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  b record;
  blockers jsonb;
begin
  -- Founder only. This is a provisioning action, not something a company does to itself:
  -- a company admin must never be able to delete a branch out from under its own records.
  if not public.is_platform_admin() then
    return jsonb_build_object('removed', false, 'reason', 'not_permitted', 'blocked_by', '[]'::jsonb);
  end if;

  -- Lock the row so the count below cannot go stale between checking and deleting.
  select id, name, company_id, kind into b
  from public.branches where id = p_branch for update;

  if not found then
    return jsonb_build_object('removed', false, 'reason', 'not_found', 'blocked_by', '[]'::jsonb);
  end if;

  -- The office/team row is the company itself, not a branch. It is never billed and must
  -- never be removable: every company needs somewhere for head office records to sit.
  if b.kind is distinct from 'branch' then
    return jsonb_build_object('removed', false, 'reason', 'not_a_branch',
                              'blocked_by', '[]'::jsonb, 'name', b.name);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('what', what, 'n', n)), '[]'::jsonb)
    into blockers
  from public.branch_blocking_references(p_branch);

  if jsonb_array_length(blockers) > 0 then
    return jsonb_build_object('removed', false, 'reason', 'in_use',
                              'blocked_by', blockers, 'name', b.name);
  end if;

  delete from public.branches where id = p_branch;

  return jsonb_build_object('removed', true, 'reason', null,
                            'blocked_by', '[]'::jsonb, 'name', b.name);
end;
$$;

revoke all on function public.remove_unused_branch(uuid) from public, anon;
grant execute on function public.remove_unused_branch(uuid) to authenticated, service_role;

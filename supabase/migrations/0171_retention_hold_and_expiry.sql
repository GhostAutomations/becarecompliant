-- 0171_retention_hold_and_expiry
--
-- THE LIST item 18: nothing ever enforced retention. lib/evidence/retention.ts has held the
-- eight year rule, a backfill and an anonymise function since Phase 2 and NOTHING CALLED ANY
-- OF IT: every one of the 345 evidence rows had retention_until null and nothing had ever
-- been anonymised. Evidence was kept for ever. That is a UK GDPR storage limitation gap, and
-- the privacy notice had already been re-worded once to stop promising a process nobody ran.
--
-- Two pieces here, the code does the rest:
--
--   A) A RETENTION HOLD on a Person or a Service User. An automatic expiry with no escape
--      hatch will one day destroy evidence somebody still needs: an ongoing tribunal, a
--      safeguarding investigation, an insurance claim. A held record's evidence is never
--      anonymised, whatever its date. Reason is captured because "why is this held" is the
--      question asked years later, by which time nobody remembers.
--
--   B) expire_evidence_retention(), the only path that anonymises on a schedule.
--      anonymise_evidence() cannot be used by a cron: it authorises with auth.uid() and
--      demands an admin, so a service role call raises. This one is SECURITY DEFINER and
--      NOT callable by anon or authenticated (same lesson as spend_sms_credit): a browser
--      must never be able to reach a function that destroys evidence.

-- A) The hold ------------------------------------------------------------------

alter table public.people
  add column if not exists retention_hold boolean not null default false,
  add column if not exists retention_hold_reason text,
  add column if not exists retention_hold_set_at timestamptz,
  add column if not exists retention_hold_set_by uuid references auth.users(id);

alter table public.service_users
  add column if not exists retention_hold boolean not null default false,
  add column if not exists retention_hold_reason text,
  add column if not exists retention_hold_set_at timestamptz,
  add column if not exists retention_hold_set_by uuid references auth.users(id);

-- The cron reads this every day; without it the scan is a full table scan of all evidence.
create index if not exists evidence_retention_due_idx
  on public.evidence (retention_until)
  where anonymised_at is null and retention_until is not null;

-- B) Scheduled expiry ----------------------------------------------------------

create or replace function public.expire_evidence_retention(p_limit int default 200)
returns table (evidence_id uuid, company_id uuid, purged_path text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_ids uuid[];
begin
  -- Batched on purpose: a first run on a long standing customer could otherwise try to
  -- anonymise years of evidence and delete thousands of storage objects in one request.
  select coalesce(array_agg(due.id), '{}')
  into v_ids
  from (
    select e.id
    from public.evidence e
    left join public.people p
      on e.record_type = 'person' and p.id = e.record_id
    left join public.service_users su
      on e.record_type = 'service_user' and su.id = e.record_id
    where e.anonymised_at is null
      and e.retention_until is not null
      and e.retention_until <= current_date
      -- A held record is skipped, and stays skipped, until the hold is lifted.
      and coalesce(p.retention_hold, false) = false
      and coalesce(su.retention_hold, false) = false
    order by e.retention_until
    limit greatest(coalesce(p_limit, 200), 1)
  ) due;

  if array_length(v_ids, 1) is null then
    return;
  end if;

  -- The storage paths are read in the SAME statement that clears them: every CTE sees one
  -- snapshot, so `collected` still holds the paths the updates are about to null. The caller
  -- needs them to remove the objects from the private bucket; a row anonymised in the
  -- database with its file left in storage would be the worst of both worlds.
  return query
  with collected as (
    -- One BASE row per anonymised evidence, with a null path, so an evidence record that
    -- happens to hold no files is still reported. Without it the caller would count only
    -- the records that had attachments, under-report the run and skip their audit rows.
    select e.id as eid, e.company_id as cid, null::text as path
    from public.evidence e
    where e.id = any(v_ids)
    union all
    select e.id as eid, e.company_id as cid, e.pdf_path as path
    from public.evidence e
    where e.id = any(v_ids) and e.pdf_path is not null
    union all
    select f.evidence_id, e.company_id, f.storage_path
    from public.evidence_files f
    join public.evidence e on e.id = f.evidence_id
    where f.evidence_id = any(v_ids) and f.storage_path is not null
  ),
  purged_files as (
    update public.evidence_files
    set storage_path = null, file_name = null, purged_at = now()
    where evidence_id = any(v_ids)
    returning 1
  ),
  purged_evidence as (
    update public.evidence
    set answers = '{}'::jsonb,
        author_email = null,
        author_name = null,
        pdf_path = null,
        pdf_purged_at = now(),
        anonymised_at = now()
        -- anonymised_by stays NULL: no person did this, the retention rule did. The audit
        -- row the caller writes names the process.
    where id = any(v_ids)
    returning 1
  )
  select eid, cid, path from collected;
end;
$fn$;

-- A function that destroys evidence is reachable ONLY by the service role.
revoke all on function public.expire_evidence_retention(int) from public;
revoke all on function public.expire_evidence_retention(int) from anon;
revoke all on function public.expire_evidence_retention(int) from authenticated;
grant execute on function public.expire_evidence_retention(int) to service_role;

comment on function public.expire_evidence_retention(int) is
  'Anonymises evidence past retention_until, skipping records on retention hold. Service role only (the retention cron). Returns the storage paths the caller must remove.';

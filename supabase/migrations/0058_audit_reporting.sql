-- Be Care Compliant — Phase 8 (Reporting, exports & audit trail)
-- Migration 0058: a record scoped audit trail read path + a filter index.
--
-- The audit_log read policy scopes plain SELECTs to Company Admins (own company)
-- and the Platform Admin, which powers the company and founder audit viewers. For
-- the per record history timeline shown in a Person / Service User drill down we
-- also want branch Managers to see that one record's history. That is a wider
-- read than the base policy allows, so it goes through a SECURITY DEFINER RPC
-- guarded by RECORD OWNERSHIP (can_manage_person / can_manage_service_user), not
-- just company membership: a user callable SECURITY DEFINER function still runs
-- with the caller's auth.uid(), so the guard lives inside the query and returns
-- zero rows to anyone who may not manage the record.
--
-- Applied to the Be Care Compliant project (ref bgrtcvyjuwopunpnudeu) ONLY.

-- One record's audit trail: the record's own change events plus every Evidence
-- event (created, downloaded, anonymised) for that record, oldest first.
create or replace function public.record_audit_trail(
  p_record_type text,
  p_record_id uuid
)
returns table (
  created_at timestamptz,
  action text,
  actor_email text,
  actor_role text,
  summary text,
  entity_type text,
  entity_id text,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.created_at, a.action, a.actor_email, a.actor_role,
         a.summary, a.entity_type, a.entity_id, a.metadata
  from public.audit_log a
  where p_record_type in ('person', 'service_user')
    and (
      (p_record_type = 'person' and public.can_manage_person(p_record_id))
      or (p_record_type = 'service_user' and public.can_manage_service_user(p_record_id))
    )
    and (
      (a.entity_type = p_record_type and a.entity_id = p_record_id::text)
      or (
        a.entity_type = 'evidence'
        and a.entity_id in (
          select e.id::text
          from public.evidence e
          where e.record_type = p_record_type
            and e.record_id = p_record_id
        )
      )
    )
  order by a.created_at asc;
$$;

grant execute on function public.record_audit_trail(text, uuid) to authenticated;

-- Helps the company / founder audit viewers when filtering by actor.
create index if not exists audit_log_actor_created_idx
  on public.audit_log (company_id, actor_id, created_at desc);

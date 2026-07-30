-- 0155_requirement_map_allows_many_checks
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- THE ROOT CAUSE of the tiny Compliance score base.
--
-- 0109 put UNIQUE (company_id, requirement_id, source_kind) on requirement_evidence_map. That was
-- meant to stop a company mapping "outcomes" to the same requirement twice. But a mapped CHECK
-- also carries source_kind = 'check', so the constraint allowed a company exactly ONE check per
-- requirement. Acme therefore had Care and Support evidenced by a single Risk Assessment and
-- Leadership and Management by a single Annual Appraisal, both of them definitions that had since
-- been switched OFF, and 0154's backfill silently inserted nothing at all because every insert
-- hit this constraint and was swallowed by ON CONFLICT DO NOTHING.
--
-- The rule that was actually wanted: one row per metric source (a row with no check), and any
-- number of checks.
--
-- After this, Acme's Care and Support carries eight checks and Leadership and Management five,
-- and the check signal moves from 100 (one dead Risk Assessment) to 43 (60 of 106 overdue).

alter table public.requirement_evidence_map
  drop constraint if exists requirement_evidence_map_company_id_requirement_id_source_k_key;

create unique index if not exists requirement_evidence_map_source_kind_uidx
  on public.requirement_evidence_map (company_id, requirement_id, source_kind)
  where check_definition_id is null;

-- Now the backfill can actually do its job.
do $do$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.seed_requirement_map(c.id);
  end loop;
end;
$do$;

-- 0417: speed plan push 1 (Phil, 2026-10-07).
--
-- 1. The 45 rules Supabase's advisor flags (auth_rls_initplan): auth.uid() is worked out again for
--    every row. Each is rewritten so the call reads ( SELECT auth.uid() AS uid ), which Postgres
--    works out once per query. The rewrite is done here from the live rule text, replacing ONLY
--    that call, so nothing else in any rule is retyped by hand. Safe to run twice: an already
--    wrapped call is left alone. Proved before and after with the 12 user, 31 table "who sees
--    what" fingerprint.
-- 2. The 10 foreign keys the advisor lists with no index behind them.

do $$
declare
  r record;
  nq text;
  nc text;
  stmt text;
  n int := 0;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    nq := case when r.qual is null then null
               else regexp_replace(r.qual, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g') end;
    nc := case when r.with_check is null then null
               else regexp_replace(r.with_check, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g') end;
    if nq is distinct from r.qual or nc is distinct from r.with_check then
      stmt := format('alter policy %I on public.%I', r.policyname, r.tablename)
        || case when nq is not null and nq is distinct from r.qual then ' using (' || nq || ')' else '' end
        || case when nc is not null and nc is distinct from r.with_check then ' with check (' || nc || ')' else '' end;
      execute stmt;
      n := n + 1;
    end if;
  end loop;
  raise notice '0417: % rules rewritten', n;
end $$;

create index if not exists company_policies_approver_id_idx on public.company_policies (approver_id);
create index if not exists company_policies_owner_id_idx on public.company_policies (owner_id);
create index if not exists company_policy_register_topic_key_idx on public.company_policy_register (topic_key);
create index if not exists dashboard_snapshots_company_id_idx on public.dashboard_snapshots (company_id);
create index if not exists policy_drafts_approved_policy_id_idx on public.policy_drafts (approved_policy_id);
create index if not exists policy_drafts_created_by_idx on public.policy_drafts (created_by);
create index if not exists policy_drafts_owner_id_idx on public.policy_drafts (owner_id);
create index if not exists policy_drafts_policy_id_idx on public.policy_drafts (policy_id);
create index if not exists policy_drafts_topic_key_idx on public.policy_drafts (topic_key);
create index if not exists service_user_outcome_updates_evidence_id_idx on public.service_user_outcome_updates (evidence_id);

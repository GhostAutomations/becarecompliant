-- 0307_complaints_and_incidents_count_towards_readiness
--
-- Phil, 2026-09-19: complaints and incidents counted towards no regulator theme. They now do, by
-- how they were HANDLED, never by how many there were (lib/framework/case-handling.ts):
--   CIW  complaints -> Leadership and Management   incidents -> Well-being
--   CQC  complaints -> Responsive                  incidents -> Safe
-- The default mapping (0304) learns the two new sources, and every company is backfilled.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.seed_requirement_map(p_company uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reg text;
  v_before int;
  v_after int;
begin
  select coalesce(regulator, 'ciw') into v_reg from public.companies where id = p_company;
  if v_reg is null then
    return 0;  -- no such company
  end if;

  select count(*) into v_before from public.requirement_evidence_map where company_id = p_company;

  insert into public.requirement_evidence_map (company_id, requirement_id, check_definition_id, source_kind)
  select cd.company_id, r.id, cd.id, 'check'
  from public.check_definitions cd
  join public.framework_requirements r
    on r.regulator = v_reg
   and r.active
   and r.code = case
        when v_reg = 'ciw' then case
          when cd.key = 'audit' and cd.population = 'service_users' then 'CS'
          when cd.key in ('setup','care_plan_review','competency','manual_handling','spot_check',
                          'risk_assessment','mar_audit','consent_review') then 'CS'
          when cd.key in ('supervision','appraisal','probation_review','dbs','enhanced_dbs',
                          'right_to_work','audit','mentoring','induction',
                          'health_check','one_to_one','lead_the_leader') then 'LM'
          else null end
        else case
          when cd.key = 'audit' and cd.population = 'service_users' then 'EFF'
          when cd.key in ('risk_assessment','manual_handling','competency','mar_audit','dbs',
                          'enhanced_dbs','right_to_work','spot_check') then 'SAFE'
          when cd.key in ('care_plan_review','setup','consent_review') then 'EFF'
          when cd.key in ('supervision','appraisal','probation_review','audit','mentoring',
                          'induction','health_check','one_to_one','lead_the_leader') then 'WEL'
          else null end
      end
  where cd.company_id = p_company
  on conflict do nothing;

  insert into public.requirement_evidence_map (company_id, requirement_id, source_kind)
  select p_company, r.id, v.sk
  from public.framework_requirements r
  join (values
      ('ciw','W','outcomes'), ('ciw','W','satisfaction'), ('ciw','LM','training'),
      ('ciw','LM','complaints'), ('ciw','W','incidents'),
      ('cqc','RES','outcomes'), ('cqc','CAR','satisfaction'), ('cqc','WEL','training'),
      ('cqc','RES','complaints'), ('cqc','SAFE','incidents')
    ) v(reg, code, sk)
    on v.reg = r.regulator and v.code = r.code
  where r.regulator = v_reg
  on conflict do nothing;

  select count(*) into v_after from public.requirement_evidence_map where company_id = p_company;
  return v_after - v_before;
end;
$$;


do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.seed_requirement_map(c.id);
  end loop;
end
$$;

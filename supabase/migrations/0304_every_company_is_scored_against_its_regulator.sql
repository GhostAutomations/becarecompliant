-- 0304_every_company_is_scored_against_its_regulator
--
-- Phil, 2026-09-19: the dashboard score read "Nothing is mapped to score yet" for Thistle.
--
-- WHY. The score rolls each check up into a regulator theme (CIW for Wales, CQC for England)
-- through requirement_evidence_map. 0154 wrote seed_requirement_map() and called it from
-- provision_company(), but the founder's Create company screen does not use provision_company:
-- it inserts the company and seeds forms and checks itself, and never seeded the map. Every
-- company made that way, Thistle and Bevan included, had no mapping at all.
--
-- WHAT THIS DOES.
--   1. The default mapping learns the checks added since 0154 (Health Check, One to One, Lead the
--      Leader, all under Leadership and Management / Well-led, Phil's choice) and tells the two
--      Audits apart: the SERVICE USER Audit is Care and Support (CIW) / Effective (CQC), the staff
--      Audit stays Leadership and Management / Well-led (Phil's choice). They share the key
--      "audit", so population decides.
--   2. It is seeded AUTOMATICALLY: whenever a check definition is added to a company, and
--      whenever a company's regulator is set or changed. A company can no longer be left unscored
--      because of which screen created it. Idempotent, and never disturbs a mapping made by hand.
--   3. Backfills every company.
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
      ('cqc','RES','outcomes'), ('cqc','CAR','satisfaction'), ('cqc','WEL','training')
    ) v(reg, code, sk)
    on v.reg = r.regulator and v.code = r.code
  where r.regulator = v_reg
  on conflict do nothing;

  select count(*) into v_after from public.requirement_evidence_map where company_id = p_company;
  return v_after - v_before;
end;
$$;

-- 2. Seeded automatically.
create or replace function public.seed_requirement_map_on_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'check_definitions' then
    perform public.seed_requirement_map(new.company_id);
  else
    perform public.seed_requirement_map(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists check_definitions_seed_requirement_map on public.check_definitions;
create trigger check_definitions_seed_requirement_map
  after insert on public.check_definitions
  for each row execute function public.seed_requirement_map_on_change();

drop trigger if exists companies_seed_requirement_map on public.companies;
create trigger companies_seed_requirement_map
  after insert or update of regulator on public.companies
  for each row execute function public.seed_requirement_map_on_change();

-- 3. Backfill.
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.seed_requirement_map(c.id);
  end loop;
end
$$;

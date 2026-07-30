-- 0154_framework_mapping_and_coverage
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- WHY. The Compliance score read 85% "Good" for a company whose PQS return was dire. The score
-- was not lying about its own arithmetic, it was measuring almost nothing:
--
--   * The evidence map was seeded for ONE company in 0109 and never for anybody else, so a
--     provisioned company had no mapping at all and a hand mapped one covered two checks.
--     Acme scored Care and Support 100 from a SINGLE Risk Assessment instance, and Leadership
--     and Management 68 from Annual Appraisal alone. Supervision, Care Plan Review, Spot Check,
--     Medication Competency, Manual Handling, Mentoring and Setup never touched the score.
--   * The readiness roll-up drops any instance with no due date, and a dropped instance can only
--     help: Mentoring had 42 of 42 with no due date, Audit 64 of 66, Medication Competency 34 of
--     41. They were silently absent rather than counted as unknown.
--   * It counted instances belonging to check definitions that had been switched OFF. Acme's
--     Risk Assessment definition is inactive, and it was carrying a whole requirement.
--
-- WHAT THIS DOES.
--   1. seed_requirement_map(company): the default mapping for a company, by check key, for both
--      regulators. Idempotent, so it is safe to run again and never disturbs a mapping somebody
--      has already made by hand.
--   2. Backfills every existing company.
--   3. provision_company() calls it, so a new company is never unmapped.
--   4. get_framework_check_readiness() gains an unscheduled count and ignores instances whose
--      definition is no longer active.

-- ===========================================================================
-- 1. The default mapping.
-- ===========================================================================
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

  -- Checks, by key. The CIW assignments for setup, care_plan_review, competency,
  -- manual_handling and spot_check are the ones 0109 already seeded, kept identical on purpose:
  -- moving an existing company's check to another theme would silently move its score.
  insert into public.requirement_evidence_map (company_id, requirement_id, check_definition_id, source_kind)
  select cd.company_id, r.id, cd.id, 'check'
  from public.check_definitions cd
  join public.framework_requirements r
    on r.regulator = v_reg
   and r.code = case
        when v_reg = 'ciw' then case
          when cd.key in ('setup','care_plan_review','competency','manual_handling','spot_check',
                          'risk_assessment','mar_audit','consent_review') then 'CS'
          when cd.key in ('supervision','appraisal','probation_review','dbs','enhanced_dbs',
                          'right_to_work','audit','mentoring','induction') then 'LM'
          else null end
        else case
          when cd.key in ('risk_assessment','manual_handling','competency','mar_audit','dbs',
                          'enhanced_dbs','right_to_work','spot_check') then 'SAFE'
          when cd.key in ('care_plan_review','setup','consent_review') then 'EFF'
          when cd.key in ('supervision','appraisal','probation_review','audit','mentoring',
                          'induction') then 'WEL'
          else null end
      end
  where cd.company_id = p_company
  on conflict do nothing;

  -- The metric sources: personal outcomes, customer satisfaction and mandatory training.
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

grant execute on function public.seed_requirement_map(uuid) to authenticated;

-- ===========================================================================
-- 2. Backfill every company that exists today.
-- ===========================================================================
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.seed_requirement_map(c.id);
  end loop;
end;
$$;

-- ===========================================================================
-- 3. Provisioning seeds it too, so a new company is never unmapped.
-- ===========================================================================
create or replace function public.provision_company(
  p_name text,
  p_slug text,
  p_tier text,
  p_branch_name text,
  p_trial_days integer,
  p_owner_email text,
  p_owner_domain text,
  p_request_id uuid,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_name text := nullif(btrim(p_name), '');
  v_slug text := nullif(btrim(lower(p_slug)), '');
  v_email text := nullif(btrim(lower(p_owner_email)), '');
  v_domain text := nullif(btrim(lower(p_owner_domain)), '');
  v_days integer := coalesce(p_trial_days, 0);
  v_forms int;
  v_people int;
  v_su int;
  v_training int;
  v_map int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin may provision a company';
  end if;
  if v_name is null or v_slug is null then
    raise exception 'A company needs a name and a slug';
  end if;

  insert into public.companies (
    name, slug, tier, trial_started_at, trial_ends_at,
    trial_owner_email, trial_owner_domain, provisioned_by
  ) values (
    v_name, v_slug, coalesce(nullif(btrim(p_tier), ''), 'starter'),
    case when v_days > 0 then now() end,
    case when v_days > 0 then now() + make_interval(days => v_days) end,
    -- The one trial per address rule is held by the two partial unique indexes. The address is
    -- claimed whatever the number of days, and it is NOT re-claimed on a deliberate override,
    -- because the first company still holds it.
    case when p_override_reason is null then v_email end,
    case when p_override_reason is null then v_domain end,
    case when p_request_id is null then 'founder' else 'trial_request' end
  )
  returning id into v_company_id;

  insert into public.branches (company_id, name, kind) values
    (v_company_id, v_name || ' Office', 'team'),
    (v_company_id, coalesce(nullif(btrim(p_branch_name), ''), 'Main Branch'), 'branch');

  v_forms    := public.seed_company_form_templates(v_company_id);
  v_people   := public.seed_company_people_checks(v_company_id);
  v_su       := public.seed_company_service_user_checks(v_company_id);
  v_training := public.seed_company_training_courses(v_company_id);
  perform public.seed_company_job_titles(v_company_id);
  -- AFTER the checks exist, because the mapping is built from them.
  v_map      := public.seed_requirement_map(v_company_id);

  if p_request_id is not null then
    update public.trial_requests
       set company_id = v_company_id,
           status = 'provisioned',
           status_changed_at = now(),
           status_changed_by = auth.uid()
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'forms_seeded', v_forms,
    'people_checks_seeded', v_people,
    'su_checks_seeded', v_su,
    'training_seeded', v_training,
    'requirement_maps_seeded', v_map,
    'trial_days', v_days
  );
end;
$$;

-- ===========================================================================
-- 4. The roll-up: count what is NOT scheduled, and ignore switched off checks.
-- ===========================================================================
-- The return type changes, so the old function has to go first.
drop function if exists public.get_framework_check_readiness(uuid, text);

create function public.get_framework_check_readiness(p_company uuid, p_regulator text)
returns table(requirement_id uuid, overdue int, due_soon int, on_track int, total int, unscheduled int)
language sql stable
set search_path = public, pg_temp
as $$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           ci.due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status = 'active' and pe.archived_at is null)
         or (ci.record_type = 'service_user' and su.service_status = 'active' and su.archived_at is null) )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and due_date < current_date)::int as overdue,
    count(*) filter (where due_date is not null and due_date >= current_date and due_date <= current_date + amber)::int as due_soon,
    count(*) filter (where due_date is not null and due_date > current_date + amber)::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    -- A check on a record with NO due date. It cannot be overdue, so leaving it out of the total
    -- could only ever flatter the score. It is unknown, and the reader is told how many.
    count(*) filter (where due_date is null)::int as unscheduled
  from inst
  group by requirement_id;
$$;

grant execute on function public.get_framework_check_readiness(uuid, text) to authenticated;

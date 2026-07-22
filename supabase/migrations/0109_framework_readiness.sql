-- 0109_framework_readiness
-- Inspection readiness against the regulators' own frameworks. A company is
-- assessed by CQC (England) or CIW (Wales); Thistle is Wales, so CIW. This adds:
--  - companies.framework_enabled (hidden by default; on for Thistle only) and
--    companies.regulator ('cqc' | 'ciw') so the page shows the right framework.
--  - framework_requirements: founder master data, the regulator requirements
--    (CIW's four themes; CQC's five key questions, quality statements added later).
--  - requirement_evidence_map: per company, which check / outcomes / satisfaction /
--    training evidences which requirement.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  add column if not exists framework_enabled boolean not null default false,
  add column if not exists regulator text check (regulator is null or regulator in ('cqc', 'ciw'));

update public.companies
  set framework_enabled = true, regulator = 'ciw'
  where id = '9d7d082b-89d8-44f6-83b8-71b5155c7d51';

-- ===========================================================================
-- Regulator requirements (founder master data; same for every company).
-- ===========================================================================
create table if not exists public.framework_requirements (
  id uuid primary key default gen_random_uuid(),
  regulator text not null check (regulator in ('cqc', 'ciw')),
  key_area text not null,            -- CIW theme key, or CQC key question
  code text not null,                -- stable short code, unique per regulator
  title text not null,
  description text not null default '',
  evidence_category text,            -- CQC only: one of the six categories
  active boolean not null default true,
  sort_order int not null default 0,
  unique (regulator, code)
);

alter table public.framework_requirements enable row level security;

-- Readable by any authenticated user (master reference); only the platform admin writes.
create policy framework_requirements_select on public.framework_requirements
  for select to authenticated using (true);
create policy framework_requirements_write on public.framework_requirements
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

insert into public.framework_requirements (regulator, key_area, code, title, description, sort_order) values
  ('ciw','wellbeing','W','Well-being','People achieve positive personal outcomes and their voice, choice and rights are upheld.',1),
  ('ciw','care_support','CS','Care and Support','Care and support are provided in line with people''s assessed needs and the outcomes they want.',2),
  ('ciw','leadership','LM','Leadership and Management','Governance, staffing, supervision and oversight that drive safe, good quality care.',3),
  ('ciw','environment','ENV','Environment','Suitability and safety of the environment (services that provide accommodation).',4),
  ('cqc','safe','SAFE','Safe','People are protected from abuse and avoidable harm.',1),
  ('cqc','effective','EFF','Effective','Care achieves good outcomes and is based on the best available evidence.',2),
  ('cqc','caring','CAR','Caring','People are treated with compassion, dignity and respect.',3),
  ('cqc','responsive','RES','Responsive','Services are organised to meet people''s needs.',4),
  ('cqc','well_led','WEL','Well-led','Leadership, governance and culture ensure high quality, person-centred care.',5)
on conflict (regulator, code) do nothing;

-- ===========================================================================
-- Per company mapping: what evidences each requirement.
-- ===========================================================================
create table if not exists public.requirement_evidence_map (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requirement_id uuid not null references public.framework_requirements(id) on delete cascade,
  check_definition_id uuid references public.check_definitions(id) on delete cascade,
  source_kind text,                  -- 'check' | 'outcomes' | 'satisfaction' | 'training'
  created_at timestamptz not null default now(),
  unique (company_id, requirement_id, check_definition_id),
  unique (company_id, requirement_id, source_kind)
);

create index requirement_evidence_map_company_idx on public.requirement_evidence_map (company_id);

alter table public.requirement_evidence_map enable row level security;

create policy requirement_evidence_map_select on public.requirement_evidence_map
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));
create policy requirement_evidence_map_write on public.requirement_evidence_map
  for all to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- Seed Thistle's mapping (CIW). Checks map by key to a theme; outcomes,
-- satisfaction and training map by source_kind.
-- ===========================================================================
insert into public.requirement_evidence_map (company_id, requirement_id, check_definition_id, source_kind)
select cd.company_id, r.id, cd.id, 'check'
from public.check_definitions cd
join public.framework_requirements r
  on r.regulator = 'ciw'
 and r.code = case
      when cd.key in ('setup','care_plan_review','competency','manual_handling','spot_check','risk_assessment','mar_audit','consent_review') then 'CS'
      when cd.key in ('supervision','appraisal','probation_review','dbs','enhanced_dbs','right_to_work') then 'LM'
      else null
    end
where cd.company_id = '9d7d082b-89d8-44f6-83b8-71b5155c7d51'
on conflict do nothing;

insert into public.requirement_evidence_map (company_id, requirement_id, source_kind)
select '9d7d082b-89d8-44f6-83b8-71b5155c7d51', r.id, v.sk
from public.framework_requirements r
join (values ('W','outcomes'), ('W','satisfaction'), ('LM','training')) v(code, sk)
  on v.code = r.code and r.regulator = 'ciw'
on conflict do nothing;

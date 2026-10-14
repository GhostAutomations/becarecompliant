-- 0467: Incident form fixes, from Thistle (Phil, 2026-10-14), for every company now and to come.
--
--  A. THE RIGHT REGULATOR. "Notify the regulator" named both CQC and CIW. Each branch now says
--     which one it answers to (branches.regulator), filled from its company for every branch
--     that exists and defaulted the same way for every branch made later, whichever way it is
--     made (the trigger below, so no insert path can forget). Admins can change it in
--     Branch settings. The incident case names only that one.
--  D. RIDDOR on the case, beside Notifiable and Safeguarding (Phil's popup: "On the case, like
--     Notifiable"): Yes or No, the date it went to the HSE and the HSE reference. The Outcome
--     form's own two RIDDOR questions are untouched.
--  E. OTHER, SAID IN WORDS. When the kind of event is Other, "What type of incident was it?" is
--     asked and required: on the Report form (Phil's popup: "Report form and the case") and on
--     the case. Stored as category 'Other' plus incidents.category_other, so reports still group
--     it under Other.
--
-- REPORT FORM VERSIONING, the rule 0303 used: a company whose current version already has
-- Evidence against it gets a NEW version, so a filed report keeps the questions it was asked;
-- one with none is updated in place. form_templates is updated too, so new companies get it.
-- Nothing else on any form changes: the question is inserted straight after each of the four
-- kind questions and every other field (including the baked branch list) is kept as it is.
--
-- Safe to run twice. Applied to the becarecompliant project ONLY (bgrtcvyjuwopunpnudeu).

-- ---------------------------------------------------------------------------------------------
-- A. branches.regulator
-- ---------------------------------------------------------------------------------------------
alter table public.branches add column if not exists regulator text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'branches_regulator_check') then
    alter table public.branches add constraint branches_regulator_check
      check (regulator is null or regulator in ('cqc', 'ciw'));
  end if;
end
$c$;
comment on column public.branches.regulator is
  'Which regulator this branch answers to: cqc or ciw (0467). Defaults to the company''s. The incident case names only this one.';

update public.branches b
   set regulator = c.regulator
  from public.companies c
 where c.id = b.company_id
   and b.regulator is null
   and c.regulator is not null;

-- Every new branch starts with its company's regulator unless one was given.
create or replace function public.branches_default_regulator()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.regulator is null then
    select c.regulator into new.regulator from public.companies c where c.id = new.company_id;
  end if;
  return new;
end;
$$;
revoke all on function public.branches_default_regulator() from public, anon, authenticated;

drop trigger if exists branches_default_regulator on public.branches;
create trigger branches_default_regulator
  before insert on public.branches
  for each row execute function public.branches_default_regulator();

-- ---------------------------------------------------------------------------------------------
-- D and E. The case's new answers.
-- ---------------------------------------------------------------------------------------------
alter table public.incidents add column if not exists category_other text;
alter table public.incidents add column if not exists riddor_reportable boolean;
alter table public.incidents add column if not exists riddor_reported_on date;
alter table public.incidents add column if not exists riddor_reference text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_category_other_check') then
    alter table public.incidents add constraint incidents_category_other_check
      check (category_other is null or (category = 'Other' and length(category_other) <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_riddor_check') then
    alter table public.incidents add constraint incidents_riddor_check
      check ((riddor_reportable is true or (riddor_reported_on is null and riddor_reference is null))
             and (riddor_reported_on is null or riddor_reported_on >= occurred_on)
             and (riddor_reference is null or length(riddor_reference) <= 200));
  end if;
end
$c$;
comment on column public.incidents.category_other is
  'What type of incident it was, in words, when the kind of event is Other (0467).';
comment on column public.incidents.riddor_reportable is
  'Reportable under RIDDOR: true, false, or null when nobody has said (0467).';

-- ---------------------------------------------------------------------------------------------
-- E. "What type of incident was it?" on the Incident Report.
-- ---------------------------------------------------------------------------------------------
create or replace function pg_temp.incident_report_with_other(p_schema jsonb)
returns jsonb
language sql
as $$
  select jsonb_set(p_schema, '{sections}', (
    select jsonb_agg(
      jsonb_set(sec, '{fields}', coalesce((
        select jsonb_agg(f order by fo, sub)
        from (
          select fld as f, fo, 0 as sub
            from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
          union all
          select jsonb_build_object(
                   'key', (fld->>'key') || '_other',
                   'type', 'short_text',
                   'label', 'What type of incident was it?',
                   'required', true,
                   'validation', jsonb_build_object('maxLength', 200),
                   'visibleWhen', jsonb_build_object('field', fld->>'key', 'in', jsonb_build_array('Other'))),
                 fo, 1
            from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
           where fld->>'key' in ('category_accident', 'category_near_miss',
                                 'category_incident', 'category_dangerous_occurrence')
             -- Safe to run twice: not added where it is already there.
             and not exists (select 1 from jsonb_array_elements(sec->'fields') x
                              where x->>'key' = (fld->>'key') || '_other')
        ) rows), '[]'::jsonb))
      order by so)
    from jsonb_array_elements(p_schema->'sections') with ordinality as ss(sec, so)));
$$;

do $mig$
declare
  c record;
  v_key text := 'incident_report';
  v_form uuid; v_version integer; v_used boolean;
  v_old jsonb; v_new jsonb;
begin
  update public.form_templates
     set schema = pg_temp.incident_report_with_other(schema), version = version + 1, updated_at = now()
   where key = v_key
     and schema <> pg_temp.incident_report_with_other(schema);

  for c in select id from public.companies where deleted_at is null loop
    select f.id, f.current_version into v_form, v_version
      from public.forms f where f.company_id = c.id and f.key = v_key;
    if v_form is null then continue; end if;

    select fv.schema into v_old
      from public.form_versions fv where fv.form_id = v_form and fv.version = v_version;
    if v_old is null then continue; end if;
    v_new := pg_temp.incident_report_with_other(v_old);
    if v_new = v_old then continue; end if;

    select exists (
      select 1 from public.evidence e
      join public.form_versions fv on fv.id = e.form_version_id
      where fv.form_id = v_form and fv.version = v_version
    ) into v_used;

    if v_used then
      select coalesce(max(version), 0) + 1 into v_version
        from public.form_versions where form_id = v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, v_version, v_new, 'published');
      update public.forms set current_version = v_version, updated_at = now() where id = v_form;
    else
      update public.form_versions set schema = v_new
       where form_id = v_form and version = v_version;
    end if;
  end loop;
end
$mig$;

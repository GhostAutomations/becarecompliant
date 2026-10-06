-- 0407_incident_branch_is_an_id
-- URGENT (Phil, 2026-10-06): Thistle Care went to record an incident, chose the branch, and the
-- "Service user involved" box answered "No record matches that. Add the record first." for every
-- service user.
--
-- WHY. The Incident Report's Branch question is the one branch field in the product whose answer
-- is the branch's ID (0302/0303 baked {value: id, label: name}): the server checks that id against
-- the company, and the service user list is narrowed to records whose branch_id equals it.
-- rebake_form_field_options (0144, run whenever a company's branches or staff change) rebakes
-- EVERY form's 'branch' field with {value: name, label: name}, so it quietly turned the incident
-- form's ids back into names. "Newport" never equals a branch id, so the scoped list was always
-- empty, and the report could not have been filed either ("That branch was not found").
-- Every company's incident_report copy had been rebaked like this.
--
-- FIX. The rebake now gives the incident_report form id options and every other form the name
-- options it has always had; and the id options are put back on every company's incident_report
-- now. Labels are unchanged, so nobody sees any difference except that it works.
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create or replace function public.rebake_form_field_options(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  staff_opts jsonb;
  branch_opts jsonb;
  branch_id_opts jsonb;
  funding_opts jsonb;
  f record;
begin
  if p_company_id is null then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', s.n, 'value', s.n) order by s.n), '[]'::jsonb)
    into staff_opts
  from (
    select distinct coalesce(nullif(trim(p.full_name), ''), p.email) as n
    from public.profiles p
    where p.company_id = p_company_id
      and p.status = 'active'
      and p.role not in ('platform_admin', 'staff', 'senior', 'team_member')
  ) s
  where s.n is not null and trim(s.n) <> '';

  select coalesce(jsonb_agg(jsonb_build_object('label', b.name, 'value', b.name) order by b.name), '[]'::jsonb)
    into branch_opts
  from public.branches b
  where b.company_id = p_company_id
    and b.kind in ('branch', 'team');

  -- The incident report answers with the branch ID (0302/0303, 0407).
  select coalesce(jsonb_agg(jsonb_build_object('value', b.id::text, 'label', b.name) order by b.name), '[]'::jsonb)
    into branch_id_opts
  from public.branches b
  where b.company_id = p_company_id
    and b.kind in ('branch', 'team');

  select coalesce(jsonb_agg(jsonb_build_object('label', cat.label, 'value', cat.key)
                            order by cat.sort_order), '[]'::jsonb)
    into funding_opts
  from public.company_funding_options o
  join public.funding_option_catalogue cat on cat.key = o.option_key
  where o.company_id = p_company_id;

  for f in select id, key from public.forms where company_id = p_company_id loop
    update public.form_versions v
    set schema = jsonb_set(v.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when (fld->>'type') = 'single_select'
               and lower(fld->>'key') = 'branch'
               and f.key = 'incident_report'
               and jsonb_array_length(branch_id_opts) > 0
              then jsonb_set(fld, '{options}', branch_id_opts)
              when (fld->>'type') = 'single_select'
               and lower(fld->>'key') in ('branch', 'region')
               and jsonb_array_length(branch_opts) > 0
              then jsonb_set(fld, '{options}', branch_opts)
              when (fld->>'type') = 'single_select'
               and lower(fld->>'key') = 'conducted_by'
              then jsonb_set(fld, '{options}', staff_opts)
              when (fld->>'type') in ('single_select', 'radio', 'multi_select')
               and lower(fld->>'key') = 'funding_source'
               and jsonb_array_length(funding_opts) > 0
              then jsonb_set(fld, '{options}', funding_opts)
              else fld
            end
            order by fo
          )
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so
      )
      from jsonb_array_elements(v.schema->'sections') with ordinality as ss(sec, so)
    ))
    where v.form_id = f.id
      and exists (
        select 1
        from jsonb_array_elements(v.schema->'sections') s2,
             jsonb_array_elements(s2->'fields') fl
        where (fl->>'type') in ('single_select', 'radio', 'multi_select')
          and lower(fl->>'key') in ('branch', 'region', 'conducted_by', 'funding_source')
      );
  end loop;
end;
$function$;

-- Put the ids back now, for every company with an incident report.
do $$
declare c record;
begin
  for c in select distinct company_id from public.forms where key = 'incident_report' and company_id is not null loop
    perform public.rebake_form_field_options(c.company_id);
  end loop;
end $$;

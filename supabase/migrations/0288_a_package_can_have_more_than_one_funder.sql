-- 0288_a_package_can_have_more_than_one_funder
--
-- Phil, 2026-09-17: "for funding options, clients might need to or more options so for example
-- the council me pay for their main serivce but them might add one or tw o private calls or a
-- respite call that the council wont pay for", and on how the two sit together: "if they have
-- two or more funding sources, private will also be the last option so that all calls will be
-- primary funding, private will just be adhoc calls".
--
-- So a package has a PRIMARY funder that pays for the calls in it, and may ALSO have private
-- money for ad hoc calls on top. One radio button could not say that: a council funded package
-- with a Friday shop the family pays for had to be recorded as one or the other, and whichever
-- was chosen, the other was a fact the record did not hold.
--
-- funding_source becomes a multi_select. The order matters and is the rule Phil gave: the
-- primary funder is chosen from the list, and Private sits at the BOTTOM of it, because that is
-- what it means here -- not the package, the extras on top. So `private` is moved to the end of
-- the catalogue rather than left in the middle of the organisation funders.
--
-- rebake_form_field_options learns multi_select for this key, or every company's baked list
-- would be silently skipped the moment the type changed and the question would offer the
-- library's three placeholder options instead of the company's own.
--
-- V1 is edited in place, guarded by the same refusal 0262 used: no Evidence against the Setup
-- form. Zero at the time of writing.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 1. Private goes last. It is the "and also" option, not one of the primary funders.
update public.funding_option_catalogue set sort_order = 999 where key = 'private';

-- 2. The question becomes a multi_select, in the template and in every company's live version.
do $$
declare
  n_evidence int;
  r record;
  keep jsonb;
  fs jsonb;
  new_schema jsonb;
begin
  select count(*) into n_evidence
  from public.evidence e join public.forms f on f.id = e.form_id
  where f.key = 'setup';

  if n_evidence > 0 then
    raise exception
      'Refusing to edit v1: % Evidence records exist against the Setup form. Publish a new version instead.',
      n_evidence;
  end if;

  for r in select id, schema from public.form_templates where key = 'setup' loop
    select jsonb_object_agg(fl->>'key', fl) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') fl;

    -- The OPTIONS ARE KEPT, whatever they are. On the library template they are the three
    -- placeholders; on a company's copy they are that company's own baked list, and rewriting
    -- them here would throw away the thing rebake exists to put there.
    fs := (keep->'funding_source')
          || jsonb_build_object(
               'type', 'multi_select',
               'label', 'Care package funded by',
               'help', 'Tick the funder that pays for the calls in this package. Tick Private as well if the family pays for ad hoc calls on top.');

    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(case when fld->>'key' = 'funding_source' then fs else fld end order by fo)
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so
      )
      from jsonb_array_elements(r.schema->'sections') with ordinality as ss(sec, so)
    ));

    update public.form_templates set schema = new_schema, updated_at = now() where id = r.id;
  end loop;

  for r in
    select fv.id, fv.schema
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id and fv.version = f.current_version
    where f.key = 'setup'
  loop
    select jsonb_object_agg(fl->>'key', fl) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') fl;

    fs := (keep->'funding_source')
          || jsonb_build_object(
               'type', 'multi_select',
               'label', 'Care package funded by',
               'help', 'Tick the funder that pays for the calls in this package. Tick Private as well if the family pays for ad hoc calls on top.');

    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(case when fld->>'key' = 'funding_source' then fs else fld end order by fo)
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so
      )
      from jsonb_array_elements(r.schema->'sections') with ordinality as ss(sec, so)
    ));

    update public.form_versions set schema = new_schema where id = r.id;
  end loop;
end $$;

-- 3. Rebake must know the new type, or a company's own funding list stops being baked in.
--
-- Taken from the LIVE definition and changed in exactly two places, the two type lists, because
-- the copy of this function in 0256 is not what is deployed: branch options are baked by NAME and
-- Conducted by comes from profiles rather than people. Retyping it from the older migration would
-- have quietly reverted both.
create or replace function public.rebake_form_field_options(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  staff_opts jsonb;
  branch_opts jsonb;
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
      and p.role not in ('platform_admin', 'staff', 'team_member')
  ) s
  where s.n is not null and trim(s.n) <> '';

  select coalesce(jsonb_agg(jsonb_build_object('label', b.name, 'value', b.name) order by b.name), '[]'::jsonb)
    into branch_opts
  from public.branches b
  where b.company_id = p_company_id
    and b.kind in ('branch', 'team');

  select coalesce(jsonb_agg(jsonb_build_object('label', cat.label, 'value', cat.key)
                            order by cat.sort_order), '[]'::jsonb)
    into funding_opts
  from public.company_funding_options o
  join public.funding_option_catalogue cat on cat.key = o.option_key
  where o.company_id = p_company_id;

  for f in select id from public.forms where company_id = p_company_id loop
    update public.form_versions v
    set schema = jsonb_set(v.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when (fld->>'type') = 'single_select'
               and lower(fld->>'key') in ('branch', 'region')
               and jsonb_array_length(branch_opts) > 0
              then jsonb_set(fld, '{options}', branch_opts)
              when (fld->>'type') = 'single_select'
               and lower(fld->>'key') = 'conducted_by'
              then jsonb_set(fld, '{options}', staff_opts)
              -- multi_select since 0288: a package can name more than one funder.
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

-- 4. Re-bake every company now, so the new type carries their own list and Private sits last.
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.rebake_form_field_options(c.id);
  end loop;
end $$;

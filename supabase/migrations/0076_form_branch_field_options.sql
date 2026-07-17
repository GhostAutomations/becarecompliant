-- 0076_form_branch_field_options
-- Any form field keyed 'branch' or 'region' is really the company's branch, so its
-- single-select options must be the company's ACTUAL branches (e.g. Cardiff1,
-- Newport1) rather than the generic seeded values (Newport/Cardiff). This keeps the
-- branch auto-fill valid on both the client and the authoritative server validation.
-- Applied in place to every company form copy (all versions); master templates are
-- left generic since they have no company. Evidence keeps its own frozen snapshot.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

do $$
declare
  f record;
  br_opts jsonb;
begin
  for f in select id, company_id from public.forms where company_id is not null loop
    br_opts := coalesce((
      select jsonb_agg(jsonb_build_object('label', b.name, 'value', b.name) order by b.name)
      from public.branches b
      where b.company_id = f.company_id and b.kind in ('branch', 'team')
    ), '[]'::jsonb);

    update public.form_versions v
    set schema = jsonb_set(v.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when lower(fld->>'key') in ('branch', 'region') and (fld->>'type') = 'single_select'
              then jsonb_set(fld, '{options}', br_opts)
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
        select 1 from jsonb_array_elements(v.schema->'sections') s, jsonb_array_elements(s->'fields') fl
        where lower(fl->>'key') in ('branch', 'region')
      );
  end loop;
end $$;

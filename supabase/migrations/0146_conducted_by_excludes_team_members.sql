-- 0146_conducted_by_excludes_team_members
-- Phil, live test 2026-07-27: "Charlotte Test is a team member they would not be
-- conducting interviews." 0144 excluded only platform admins from the conducted_by
-- option list. It must also exclude Team Members (`staff`, the carer self-service
-- login) and Viewers (`team_member`, read only): neither role can conduct or sign off
-- anything, so offering them as the person who held an interview is simply wrong, and
-- on a formal record it is worse than untidy.
--
-- Replaces rebake_form_field_options in place (same signature, same grants) and re-runs
-- it for every company so existing baked lists are corrected immediately.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- NOTE: the full function body is identical to 0144 apart from the role filter
-- (`p.role not in ('platform_admin', 'staff', 'team_member')`). See 0144 for the
-- reasoning behind the jsonb rewrite and the service_role-only grant.
create or replace function public.rebake_form_field_options(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  staff_opts jsonb;
  branch_opts jsonb;
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
        where (fl->>'type') = 'single_select'
          and lower(fl->>'key') in ('branch', 'region', 'conducted_by')
      );
  end loop;
end;
$fn$;

revoke all on function public.rebake_form_field_options(uuid) from public;
revoke all on function public.rebake_form_field_options(uuid) from authenticated;
revoke all on function public.rebake_form_field_options(uuid) from anon;
grant execute on function public.rebake_form_field_options(uuid) to service_role;

-- Bring every company up to date once, so the branch options 0076 baked are correct
-- again today even before anyone touches a branch.
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.rebake_form_field_options(c.id);
  end loop;
end $$;

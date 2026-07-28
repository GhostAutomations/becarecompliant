-- 0144_rebake_form_field_options
-- Phase 10 Additions (Phil, 2026-07-28): baked-in dropdown options go stale.
-- Migration 0076 baked each company's real branches into every form field keyed
-- branch/region, which was right, but NOTHING re-bakes them: add a branch or rename
-- one and every form still offers yesterday's list. The Return to Work form now has
-- the same need for people ("Interview conducted by" becomes a dropdown of the
-- company's staff), and a staff list rots far faster than a branch list.
--
-- The options MUST live in the stored schema rather than being injected in the
-- browser, because lib/form-validate.ts validates single_select answers server side
-- against the STORED published schema (allowed.includes(String(value))). An option
-- that exists only on the client is rejected on save.
--
-- So the jsonb surgery lives here, in ONE function, and the app calls it whenever the
-- underlying list changes (accepting an invite, enabling/disabling/deleting/renaming a
-- user, creating or renaming a branch) via lib/forms/rebake-options.ts. Rewritten in
-- place across every version of every company form, exactly like 0076: Evidence keeps
-- its own frozen answer snapshot, so no completed record is disturbed.
--
-- Staff list = every ACTIVE profile in the company except platform_admin (the founder),
-- matching the "who did this" list that migration 0125 already established for the
-- Audit form. Deliberately wider than listMeetingConductors, which is limited to
-- company_admin and manager: a registered manager, supervisor or on call lead may well
-- be the one who holds the Return to Work, and a single_select they cannot choose from
-- is a dead end because free text is not an option.
--
-- SECURITY DEFINER with EXECUTE granted to service_role ONLY. The company id is a
-- parameter, so exposing it to authenticated would let any signed in user rewrite
-- another tenant's form options. Every caller goes through the service role client
-- behind its own authorisation check.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

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
      and p.role <> 'platform_admin'
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

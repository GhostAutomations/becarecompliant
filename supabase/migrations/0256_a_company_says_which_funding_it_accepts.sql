-- 0256_a_company_says_which_funding_it_accepts
-- Phil, 2026-09-09: "in the actual company settings, when admin sets the company account up,
-- they can choose what funding options they accept so the whole list isnt visible in the
-- Service user setup form."
--
-- There are ten genuine ways a Welsh domiciliary package is paid for, and no agency takes all
-- ten. Showing every one on the Setup Visit makes the person filling it in read past eight
-- answers that are never true for their company, and a long list of wrong options is how the
-- wrong one gets picked.
--
-- So the catalogue is the product's (one list, one spelling, comparable across companies) and
-- the CHOICE is the company's. Settings > Service Users ticks what this agency accepts; the
-- Setup Visit offers only those. Same shape as company_job_titles (0084): a curated list the
-- company owns, seeded with a sensible default.
--
-- The options are BAKED into the stored form, not injected in the browser, because
-- lib/form-validate.ts validates a single_select/radio answer against the STORED published
-- schema — an option that exists only on screen is refused on save. That is what
-- rebake_form_field_options is for, and this migration teaches it a third field.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 1. The catalogue. Platform-owned, readable by any signed-in user so the settings screen can
--    render it. Nobody but a migration writes to it.
create table if not exists public.funding_option_catalogue (
  key text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0
);

alter table public.funding_option_catalogue enable row level security;

drop policy if exists foc_select on public.funding_option_catalogue;
create policy foc_select on public.funding_option_catalogue
  for select to authenticated using (true);

insert into public.funding_option_catalogue (key, label, description, sort_order) values
  ('local_authority', 'Local Authority',
   'The council commissions the care and pays the provider. The person may pay an assessed contribution.', 10),
  ('la_direct_payment', 'Local Authority direct payment',
   'The council pays the person, who buys the care themselves. Public money, invoiced to the individual.', 20),
  ('nhs_chc', 'NHS Continuing Healthcare',
   'The Local Health Board funds the whole package. The person pays nothing.', 30),
  ('nhs_chc_direct_payment', 'NHS Continuing Healthcare direct payment',
   'Available in Wales from April 2026: a CHC-eligible person arranges their own care with the health board''s money.', 40),
  ('joint_funded', 'Jointly funded (Local Authority and health board)',
   'A split package for complex needs. Two payers.', 50),
  ('section_117', 'Section 117 aftercare',
   'Mental Health Act aftercare. Free to the person by law, funded jointly by council and health board.', 60),
  ('private', 'Private / self funded',
   'The person or their family pays the provider directly.', 70),
  ('compensation_or_cop', 'Compensation award or Court of Protection',
   'Care bought from a personal injury settlement or by a deputy or attorney, often through a case manager.', 80),
  ('childrens_continuing_care', 'Children and young people''s continuing care',
   'The children''s equivalent of Continuing Healthcare.', 90),
  ('charity_or_grant', 'Charity or grant funded',
   'A hospice, benevolent fund or armed forces charity pays.', 100)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- 2. What this company accepts.
create table if not exists public.company_funding_options (
  company_id uuid not null references public.companies(id) on delete cascade,
  option_key text not null references public.funding_option_catalogue(key) on delete restrict,
  primary key (company_id, option_key)
);

alter table public.company_funding_options enable row level security;

drop policy if exists cfo_select on public.company_funding_options;
create policy cfo_select on public.company_funding_options
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists cfo_write on public.company_funding_options;
create policy cfo_write on public.company_funding_options
  for all to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());

-- 3. The default a new company starts with: the three that cover almost every package.
--    Idempotent, and it never removes a choice the company has already made.
create or replace function public.seed_company_funding_options(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_funding_options: not authorised for company %', cid;
  end if;

  -- Only seed a company that has never chosen. Once an admin has ticked their own set,
  -- re-running this must not put back the ones they deliberately turned off.
  if exists (select 1 from public.company_funding_options where company_id = cid) then
    return 0;
  end if;

  insert into public.company_funding_options (company_id, option_key)
  select cid, k from unnest(array['local_authority', 'nhs_chc', 'private']) as k;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.seed_company_funding_options(uuid) from public;
revoke all on function public.seed_company_funding_options(uuid) from anon;
grant execute on function public.seed_company_funding_options(uuid) to authenticated;
grant execute on function public.seed_company_funding_options(uuid) to service_role;

-- 4. Every company that already exists gets the same default (service role context, so the
--    authorisation guard above is bypassed deliberately here by inserting directly).
insert into public.company_funding_options (company_id, option_key)
select c.id, k
from public.companies c
cross join unnest(array['local_authority', 'nhs_chc', 'private']) as k
where not exists (
  select 1 from public.company_funding_options o where o.company_id = c.id
)
on conflict do nothing;

-- 5. Teach the re-baker the funding field. Replaces the function in place (0146's version,
--    same signature, same grants) and adds a third baked field. Matches radio as well as
--    single_select, because the Setup Visit asks this one as radio buttons alongside its
--    neighbours.
create or replace function public.rebake_form_field_options(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
              when (fld->>'type') in ('single_select', 'radio')
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
        where (fl->>'type') in ('single_select', 'radio')
          and lower(fl->>'key') in ('branch', 'region', 'conducted_by', 'funding_source')
      );
  end loop;
end;
$fn$;

revoke all on function public.rebake_form_field_options(uuid) from public;
revoke all on function public.rebake_form_field_options(uuid) from authenticated;
revoke all on function public.rebake_form_field_options(uuid) from anon;
grant execute on function public.rebake_form_field_options(uuid) to service_role;

-- 6. Bake it now, so today's Setup Visit already offers the company's own list.
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.rebake_form_field_options(c.id);
  end loop;
end $$;

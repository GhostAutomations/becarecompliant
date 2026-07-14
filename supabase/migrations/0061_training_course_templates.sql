-- 0061_training_course_templates
-- Founder-curated master list of training courses, mirrored into each new company
-- on creation (like seed_company_form_templates / seed_company_people_checks).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.training_course_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  renewal_months integer check (renewal_months is null or renewal_months >= 1),
  mandatory boolean not null default true,
  is_safeguarding boolean not null default false,
  amber_days integer not null default 30 check (amber_days >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.training_course_templates enable row level security;

-- Founder-only master data.
create policy tct_select on public.training_course_templates
  for select to authenticated using (public.is_platform_admin());
create policy tct_write on public.training_course_templates
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Copy the active templates into a company's own catalogue. Idempotent (skips
-- courses the company already has by name). SECURITY DEFINER so the founder
-- onboarding flow can seed; guarded to platform admin or the company's own admin.
create or replace function public.seed_company_training_courses(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_training_courses: not authorised for company %', cid;
  end if;

  insert into public.training_courses
    (company_id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order)
  select cid, t.name, t.renewal_months, t.mandatory, t.is_safeguarding, t.amber_days, t.sort_order
  from public.training_course_templates t
  where t.active
    and not exists (
      select 1 from public.training_courses c
      where c.company_id = cid and c.name = t.name
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

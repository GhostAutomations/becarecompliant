-- 0039_create_check_type.sql
-- Phase 5: create a brand new CHECK TYPE tied to a form built in the form builder.
--
-- Agreed with Phil (popup 2026-07-10):
--   * Form-completion kind only (anchor = completion, recurring by interval). The
--     document/expiry kind (DBS style) is not created here.
--   * On creation the check is applied to every EXISTING active Record of that
--     population with a BLANK due date (form-completion checks start blank until the
--     first completion), and to all future Records via the existing apply path.
--   * Idempotent: the check_instances unique constraints make re-runs a no-op.
--
-- SECURITY DEFINER, pinned search_path, guarded by is_company_admin(company).
-- Applies to becarecompliant (ref bgrtcvyjuwopunpnudeu) ONLY.

create or replace function public.create_check_definition_with_form(
  p_company_id uuid,
  p_population text,
  p_name text,
  p_form_id uuid,
  p_frequency text,
  p_interval int,
  p_amber_days int default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_base text;
  v_suffix int := 1;
  v_def uuid;
  v_sort int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(p_company_id)) then
    raise exception 'Not authorised to create checks for this company';
  end if;
  if p_population not in ('people', 'service_users') then
    raise exception 'Invalid population %', p_population;
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Check name is required'; end if;
  if p_frequency not in ('day', 'week', 'month', 'year') then
    raise exception 'Invalid frequency %', p_frequency;
  end if;
  if p_interval is null or p_interval < 1 then raise exception 'Interval must be at least 1'; end if;

  -- The form must belong to this company, match the population, and be publishable.
  if p_form_id is null or not exists (
    select 1 from public.forms f
    where f.id = p_form_id
      and f.company_id = p_company_id
      and f.population = p_population
      and f.current_version is not null
  ) then
    raise exception 'Choose a published form that belongs to this company and population';
  end if;

  -- Unique key within (company, population).
  v_base := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g');
  v_base := btrim(v_base, '_');
  if v_base = '' then v_base := 'check'; end if;
  v_key := v_base;
  while exists (
    select 1 from public.check_definitions
    where company_id = p_company_id and population = p_population and key = v_key
  ) loop
    v_suffix := v_suffix + 1;
    v_key := v_base || '_' || v_suffix;
  end loop;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_definitions
    where company_id = p_company_id and population = p_population;

  insert into public.check_definitions
    (company_id, population, key, name, form_id, recurring, frequency, "interval",
     anchor, amber_days, active, sort_order)
  values
    (p_company_id, p_population, v_key, btrim(p_name), p_form_id, true, p_frequency, p_interval,
     'completion', p_amber_days, true, v_sort)
  returning id into v_def;

  -- Backfill existing active Records with a blank-due instance. Idempotent.
  if p_population = 'people' then
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, person_id, due_date)
    select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
    from public.people pe
    where pe.company_id = p_company_id
      and pe.employment_status = 'active'
      and pe.archived_at is null
    on conflict (definition_id, person_id) do nothing;
  else
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, service_user_id, due_date)
    select su.company_id, su.branch_id, v_def, 'service_user', su.id, null
    from public.service_users su
    where su.company_id = p_company_id
      and su.service_status <> 'cancelled'
      and su.archived_at is null
    on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
  end if;

  return v_def;
end;
$$;

-- 0017_reschedule_check_instances
-- When an Admin/Manager changes a check's schedule (interval or Annual Appraisal
-- mode), recompute the due date on existing carers who have NOT yet completed that
-- check. Dates are computed by the TS engine and passed in. Guarded to the check's
-- company Admin/Manager. Applied to ref bgrtcvyjuwopunpnudeu only.
create or replace function public.reschedule_check_instances(p_definition_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  r jsonb;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select company_id into v_company from public.check_definitions where id = p_definition_id;
  if v_company is null then raise exception 'Unknown check'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company) or public.is_company_manager(v_company)) then
    raise exception 'Not allowed to reschedule this check';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    update public.check_instances
      set due_date = nullif(r->>'due_date', '')::date, updated_at = now()
      where id = (r->>'instance_id')::uuid
        and definition_id = p_definition_id
        and last_completed_on is null;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

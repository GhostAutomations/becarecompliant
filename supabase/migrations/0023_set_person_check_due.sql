-- 0023_set_person_check_due
-- Generic helper to set a person's check due date (Phil, 2026-07-09), used to
-- schedule the Annual Appraisal when it is in "After Supervision 3" mode: completing
-- Supervision 3 sets the appraisal due one supervision interval later. Guarded to
-- someone allowed to complete the person's checks. Only sets the due date; never
-- touches the last completion. Applied to the becarecompliant Supabase project ONLY
-- (ref bgrtcvyjuwopunpnudeu).
create or replace function public.set_person_check_due(p_person_id uuid, p_check_key text, p_due_date date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_complete_person_check(p_person_id) then
    raise exception 'Not allowed to schedule this check';
  end if;

  update public.check_instances ci
    set due_date = p_due_date, updated_at = now()
  from public.check_definitions cd
  where ci.definition_id = cd.id
    and ci.person_id = p_person_id
    and cd.key = p_check_key
    and cd.population = 'people';
end;
$$;

-- 0020_reanchor_supervision_cycle
-- Annual Appraisal restarts the supervision cycle (Phil, 2026-07-09). Completing an
-- appraisal re-anchors the person's supervision check_instance so the RAG rollup
-- reflects the fresh cycle: due_date = appraisal completion + supervision interval
-- (computed by the TS engine and passed in), and the previous completion is cleared
-- (Sup 1 due, none completed yet). Guarded to someone allowed to complete the
-- person's checks. Applied to the becarecompliant Supabase project ONLY (ref
-- bgrtcvyjuwopunpnudeu).
create or replace function public.reanchor_supervision_cycle(p_person_id uuid, p_due_date date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_complete_person_check(p_person_id) then
    raise exception 'Not allowed to reschedule supervision for this person';
  end if;

  update public.check_instances ci
    set due_date = p_due_date,
        last_completed_on = null,
        last_evidence_id = null,
        updated_at = now()
  from public.check_definitions cd
  where ci.definition_id = cd.id
    and ci.person_id = p_person_id
    and cd.key = 'supervision'
    and cd.population = 'people';
end;
$$;

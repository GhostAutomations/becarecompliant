-- 0319: an older completion never moves a Check back (DEF-057).
--
-- complete_check always overwrote last_completed_on and due_date with whatever it was given. A
-- Form filled in on screen and dated before the completion already on file (a March supervision
-- typed up after June's) therefore dragged the Check back to March, recalculated the due date
-- from March, and could turn a compliant record red. The app now checks first
-- (completionMovesCheck in lib/evidence/completion-date.ts); this is the same line held in the
-- database, so no caller can get round it by forgetting to ask. The Evidence is filed either way;
-- only the Check is left alone.

create or replace function public.complete_check(
  p_instance_id uuid,
  p_completed_on date,
  p_evidence_id uuid,
  p_next_due date,
  p_expiry_date date default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_person uuid;
  v_service_user uuid;
  v_recurring boolean;
  v_existing uuid;
  v_last date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.person_id, ci.service_user_id, cd.recurring, ci.last_evidence_id, ci.last_completed_on
    into v_person, v_service_user, v_recurring, v_existing, v_last
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;

  if v_person is null and v_service_user is null then raise exception 'Unknown check'; end if;

  if v_person is not null then
    if not public.can_complete_person_check(v_person) then
      raise exception 'Not allowed to complete this check';
    end if;
  else
    if not public.can_complete_service_user_check(v_service_user) then
      raise exception 'Not allowed to complete this check';
    end if;
  end if;

  if v_existing is not null and v_existing = p_evidence_id then return; end if;

  -- Older than the completion on file: history only, the Check is not moved.
  if v_last is not null and p_completed_on is not null and p_completed_on < v_last then return; end if;

  update public.check_instances set
    last_completed_on = p_completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(p_expiry_date, expiry_date),
    due_date = case
      when v_recurring then p_next_due
      when v_service_user is not null then due_date
      else null
    end,
    updated_at = now()
  where id = p_instance_id;
end;
$function$;

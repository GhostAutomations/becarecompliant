/*
 * 0205. A finalised on call shift is locked by the DATABASE, not by one server action.
 *
 * The lock lived entirely in updateLog: a read of `finalised`, a message, and `.eq("finalised",
 * false)` on the update. Nothing else enforced it, and 0203 widened who can update these rows
 * (every Manager and Supervisor in a company that keeps one out of hours list), so the population
 * the app-only lock has to hold against just grew. A rule that must always hold belongs in a
 * trigger, where a second write path, a fixed up row or a crafted request cannot walk around it.
 *
 * WHAT IS STILL ALLOWED AFTER FINALISING: the follow up. Resolving an urgent follow up is a
 * manager's job done days later and deliberately works on a finalised shift (resolveFollowUp),
 * so those columns, and the housekeeping ones, stay writable. Everything else is frozen —
 * including finalised itself, so a shift cannot be quietly un-finalised and edited.
 */
create or replace function public.on_call_log_finalised_is_locked()
returns trigger
language plpgsql
as $$
begin
  if not old.finalised then
    return new;
  end if;

  -- The follow up, and the housekeeping that comes with any write.
  if (new.follow_up_action is distinct from old.follow_up_action
      or new.follow_up_done is distinct from old.follow_up_done
      or new.follow_up_done_at is distinct from old.follow_up_done_at
      or new.follow_up_done_by is distinct from old.follow_up_done_by
      or new.updated_by is distinct from old.updated_by
      or new.updated_at is distinct from old.updated_at)
     and new.branch_id is not distinct from old.branch_id
     and new.shift_date is not distinct from old.shift_date
     and new.slot is not distinct from old.slot
     and new.occurred_at is not distinct from old.occurred_at
     and new.details is not distinct from old.details
     and new.handler_profile_id is not distinct from old.handler_profile_id
     and new.complaints_count is not distinct from old.complaints_count
     and new.complaints_logged is not distinct from old.complaints_logged
     and new.absences_count is not distinct from old.absences_count
     and new.absences_logged is not distinct from old.absences_logged
     and new.follow_up_required is not distinct from old.follow_up_required
     and new.follow_up_notes is not distinct from old.follow_up_notes
     and new.finalised is not distinct from old.finalised
     and new.finalised_at is not distinct from old.finalised_at
     and new.finalised_by is not distinct from old.finalised_by
     and new.ref_number is not distinct from old.ref_number
     and new.company_id is not distinct from old.company_id
  then
    return new;
  end if;

  raise exception 'This shift has been finalised and can no longer be edited.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists on_call_logs_finalised_lock on public.on_call_logs;
create trigger on_call_logs_finalised_lock
before update on public.on_call_logs
for each row execute function public.on_call_log_finalised_is_locked();

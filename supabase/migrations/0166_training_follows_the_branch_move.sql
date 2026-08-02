-- 0166_training_follows_the_branch_move
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- WHEN A CARER MOVES BRANCH, THEIR TRAINING MOVES WITH THEM (Phil, 2026-08-01: "if they swap
-- branch the new manager should get the alerts and the old one stops").
--
-- `person_training.branch_id` was a snapshot written when the record was created and never
-- touched again. `people` has had a branch sync trigger since 0004, but it only followed
-- `check_instances` and `person_trackers`, so training was left behind. Three consequences, all
-- of them wrong and one of them new:
--
--   1. The OLD branch's manager kept getting the training reminders (new as of today: before
--      this week training reached no email at all, so nothing exposed it).
--   2. The NEW branch's manager got none.
--   3. `person_training_select` is gated on the same column, so the new manager's matrix showed
--      that carer as "Not done" on every course. The training was there; she could not see it.
--
-- ONE TRIGGER, NOT A SECOND ONE. The existing function is extended rather than a new trigger
-- added beside it, so a branch move stays a single atomic statement and there is one place to
-- look. Its name now undersells it; the comment below says so rather than a rename churning
-- 0004's history.
--
-- updated_at AND updated_by ARE LEFT ALONE, deliberately. The carer moved; the training record
-- did not change. Stamping it would make an audit trail read as though somebody edited a
-- certificate on the day of a transfer.

create or replace function public.sync_check_instance_branch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is distinct from old.branch_id then
    update public.check_instances
      set branch_id = new.branch_id, updated_at = now()
      where person_id = new.id;
    update public.person_trackers
      set branch_id = new.branch_id
      where person_id = new.id;
    -- Training follows too (0166). Not stamped: the person moved, the record did not change.
    update public.person_training
      set branch_id = new.branch_id
      where person_id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.sync_check_instance_branch() is
  'Keeps every per person row on the branch its person is actually in: check_instances, '
  'person_trackers and person_training. Fired by the people_branch_sync trigger on an update of '
  'people.branch_id. Named for check_instances alone for historical reasons (0004).';

-- BACKFILL, for every carer who has already moved. Without it the fix only helps people who move
-- from today onwards, and the carers already sitting under the wrong manager stay there.
update public.person_training pt
   set branch_id = p.branch_id
  from public.people p
 where pt.person_id = p.id
   and pt.branch_id is distinct from p.branch_id;

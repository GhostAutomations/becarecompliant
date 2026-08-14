-- A booking is a SEPARATE FACT from a training record's status, not a third value of it.
--
-- WHY IT IS TWO COLUMNS AND NOT A NEW STATUS (Phil, 2026-08-14). person_training.status is what
-- the matrix colours by, the compliance score counts, the PQS measure scores and the daily digest
-- chases. Adding 'booked' to it would have meant four separate places all having to remember that
-- booked still means not done, and the first one to forget would let a company look compliant by
-- booking training it never delivered. As two columns, the rule holds by construction:
-- trainingStatus() is never shown a booking, so it cannot be softened by one.
--
-- It also lets a course be both at once. A certificate valid until December can be booked for
-- renewal in November: in date AND booked, two facts, two columns.

alter table public.person_training
  add column if not exists booked_for date,
  add column if not exists booked_by uuid references public.profiles(id) on delete set null;

comment on column public.person_training.booked_for is
  'The date this course is booked to be delivered. A booking NEVER makes a course compliant; it is deliberately invisible to trainingStatus().';
comment on column public.person_training.booked_by is
  'Who made the booking. A booking nobody made is a booking nobody chases.';

-- Every booking is attributed. Same reason every other record in this app names its author.
alter table public.person_training
  drop constraint if exists person_training_booking_is_attributed;
alter table public.person_training
  add constraint person_training_booking_is_attributed
  check (booked_for is null or booked_by is not null);

-- Only rows that actually carry one, which today is none of them.
create index if not exists person_training_booked_for_idx
  on public.person_training (company_id, booked_for)
  where booked_for is not null;

/*
 * A BOOKING IS SETTLED BY THE COMPLETION THAT KEEPS IT.
 *
 * Without this, a carer who attended on the third of September would have the training recorded
 * against them and STILL show "that booking was missed" on their record for ever, because the
 * booking date is now in the past. That reads as a failure where the opposite happened.
 *
 * IN A TRIGGER, not in the action, because completions arrive by three different routes: the cell
 * dialog, the bulk record, and the spreadsheet import. Three copies of one rule is how the
 * invoicing cron came to bill a different figure from the builder. RLS WITH CHECK is evaluated
 * AFTER before-triggers, so this cannot be used to reach a row a manager could not otherwise write.
 *
 * Note the comparison. A completion ON OR AFTER the booked date keeps it. A completion BEFORE it
 * does not: a course completed in January and booked for its renewal in December is a live
 * booking, not a kept one.
 */
create or replace function public.settle_kept_training_booking()
returns trigger
language plpgsql
as $$
begin
  if new.booked_for is not null
     and new.status = 'completed'
     and new.completed_on is not null
     and new.completed_on >= new.booked_for then
    new.booked_for := null;
    new.booked_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists settle_kept_training_booking on public.person_training;
create trigger settle_kept_training_booking
  before insert or update on public.person_training
  for each row execute function public.settle_kept_training_booking();

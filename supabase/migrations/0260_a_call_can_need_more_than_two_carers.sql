-- 0260_a_call_can_need_more_than_two_carers
-- Phil, 2026-09-09, designing the setup visit's care package: carers should be "a number, 1 to
-- 4", which is what Birdie does — a double up is simply the count being 2.
--
-- The care plan has only ever known single or double handed. Three and four carer calls are
-- rare but real (a hoist plus a second pair of hands, a bariatric package), and an agency that
-- runs one has no way to bill it: it either invoices for two carers and eats the third, or
-- types a manual line every month.
--
-- `carers` is added ALONGSIDE handed rather than replacing it, and both are kept true. handed
-- is read in nine places across the invoice builder, the recurring cron, the PDF and the grid;
-- swapping the column out from under them in one migration is how a money path breaks quietly.
-- carers is now the number that PRICES a line (lib/service-users/care-plan-consts.ts) and
-- handed stays as the single/double word those screens print, derived from it. Nothing that
-- reads handed changes meaning: 1 is single, 2 or more is double.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.care_plan_entries
  add column if not exists carers smallint not null default 1;

alter table public.care_plan_entries
  drop constraint if exists care_plan_entries_carers_check;
alter table public.care_plan_entries
  add constraint care_plan_entries_carers_check check (carers between 1 and 4);

-- Every row that exists today says single or double, and means 1 or 2.
update public.care_plan_entries
   set carers = case when handed = 'double' then 2 else 1 end
 where carers = 1;

-- Keep the two in step whatever writes the row, including anything not yet migrated to carers.
-- Whichever side a writer sets, the other follows: a row saying 'double' with no carers gets 2,
-- and a row saying 3 carers gets 'double' so every existing reader still prints something true.
create or replace function public.sync_care_plan_carers()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.carers is null or new.carers = 1 then
      new.carers := case when new.handed = 'double' then 2 else 1 end;
    end if;
  elsif new.carers is distinct from old.carers then
    -- carers was changed: it wins.
    null;
  elsif new.handed is distinct from old.handed then
    new.carers := case when new.handed = 'double' then 2 else 1 end;
  end if;

  new.handed := case when new.carers >= 2 then 'double' else 'single' end;
  return new;
end;
$fn$;

drop trigger if exists care_plan_entries_sync_carers on public.care_plan_entries;
create trigger care_plan_entries_sync_carers
  before insert or update on public.care_plan_entries
  for each row execute function public.sync_care_plan_carers();

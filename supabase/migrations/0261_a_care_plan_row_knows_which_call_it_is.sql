-- 0261_a_care_plan_row_knows_which_call_it_is
-- The care package agreed at the setup visit says WHEN each call is — morning, lunch,
-- afternoon, evening, night — and the care plan had nowhere to put it. Two morning calls and a
-- morning plus a tea call were the same three rows on a Tuesday, which is the thing Phil said
-- the four fixed slots could not express.
--
-- Nullable, because every row written before today has no answer and inventing one would be a
-- screen stating a fact it does not have. Billing ignores it entirely: a call costs the same
-- whenever it happens. It is there so the plan can be READ, and so the grid can show the day
-- in the order it is actually worked.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.care_plan_entries
  add column if not exists slot text;

alter table public.care_plan_entries
  drop constraint if exists care_plan_entries_slot_check;
alter table public.care_plan_entries
  add constraint care_plan_entries_slot_check
  check (slot is null or slot in ('morning', 'lunch', 'afternoon', 'evening', 'night'));

-- 0228_a_one_off_check_is_due_before_it_starts
-- The Setup check asked for "Due after start (days)" and took -1 to mean the day
-- before. Phil, 2026-09-04: "why would we setup after starting care?" A setup finished
-- after the package has begun is a setup that did not happen, and the screen was asking
-- the question the wrong way round and then requiring a minus sign to answer it
-- sensibly.
--
-- The stored value keeps its meaning - a signed day offset from the anchor - so nothing
-- downstream changes. What changes is that a non-recurring check can only be NEGATIVE:
-- the form asks for a plain positive number of days before, and both the form and the
-- server action apply the sign.
--
-- This normalises any existing non-recurring check that was set to fall after its
-- anchor. Both live companies already hold -1, so nothing moves today; it is here so
-- that no company is left holding a value the screen can no longer express.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.check_definitions
   set "interval" = -abs("interval")
 where recurring = false
   and anchor = 'completion'
   and "interval" is not null
   and "interval" > 0;

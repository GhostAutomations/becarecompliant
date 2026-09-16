-- PHASE 3 IS THE SUPERVISOR WAVE: FOUR COURSES.
--
-- Phil, 2026-09-16: "do phase 3 first, there are only 4 courses". Read off the Monday
-- board's "Phase 3 column settings" panel: four ticks at 25% each. Four times 25 is exactly
-- 100, so the panel proves its own completeness - a fifth tick anywhere in that list would
-- have to take weight off these four.
--
-- ALL FOUR ARE NAMED "ST P1" ON THE BOARD AND ARE NONE OF THEM IN THE PHASE 1 BAR. That is
-- the third time the suffix and the ticks disagree (0282 for Phase 1, 0283 for Phase 2) and
-- the third time the tick wins. The suffix is a label somebody stopped maintaining; the
-- tick is what the board actually computes from.
--
-- THESE ARE THE FOUR SCOPED TO SUPERVISOR AND ABOVE in migration 0281, which is the shape
-- of the thing: Phase 3 is the wave a carer does on being promoted, not one every care
-- assistant works through. A care assistant has no cell for any of them, so her Phase 3 bar
-- is a dash - not 0%, which would read as four courses owed, and not 100%, which would be a
-- green earned by being asked for nothing.
--
-- WHAT IS LEFT UNPHASED. "Basic Food Safety inc food prep and simple meals" alone, ticked
-- into no bar on the board. NULL is honest where a guess would put it in a wave.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.training_courses
   set phase = 3, updated_at = now()
 where phase is null
   and name in (
     'Assessing Needs',
     'Care Planning',
     'Risk Assessment',
     'Supervision and Appraisal'
   );

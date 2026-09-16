-- PHASE 2 IS THE SECOND WAVE: FIFTEEN COURSES.
--
-- Phil, 2026-09-16: "watch the screen for phase 2, i think it is 15 courses". Read off the
-- Monday board's own "Phase 2 column settings" panel - the ticked columns, not the course
-- names - which holds exactly fifteen ticks at 6-7% each (100 / 15 = 6.67). Phil's count and
-- the board agree, so the list below is the board's, not an inference from a name.
--
-- TWO OF THE FIFTEEN CARRY NO "P2" IN THEIR NAME. "Awareness of Mental Health, Dementia and
-- Learning Disability" and "Information Governance, Record Keeping" are both named "One Off"
-- on the board and are both ticked into Phase 2. This is the same naming-vs-ticks drift that
-- migration 0282 recorded for Phase 1, and the same answer: the tick is the truth, the
-- suffix is a label somebody stopped maintaining.
--
-- WHAT IS LEFT UNPHASED. Assessing Needs, Care Planning, Risk Assessment, Supervision and
-- Appraisal and Basic Food Safety stay NULL: none of them is ticked into Phase 1 or Phase 2
-- on the board, and Phase 3 is not seeded yet. NULL is honest - "no phase" - where a guess
-- would put a course in a bar it does not belong in.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.training_courses
   set phase = 2, updated_at = now()
 where phase is null
   and name in (
     'Awareness of Mental Health, Dementia and Learning Disability',
     'Information Governance, Record Keeping',
     'Ageing',
     'Consent',
     'Manual Handling Passport (AWMHP)',
     'Deprivation of Liberty',
     'Continence Promotion',
     'CoSHH',
     'Diversity and Equality',
     'Principles of Care and Confidentiality',
     'First Aid Awareness',
     'Lone Workers',
     'Oral Health',
     'Pressure Care',
     'Fluids, Nutrition and Diet'
   );

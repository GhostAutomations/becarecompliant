-- A TRAINING COURSE CAN BELONG TO A PHASE, AND PHASE 1 IS THE INDUCTION SET.
--
-- Phil, 2026-09-16, of the Monday board: "there are Phase 1, Phase 2 and Phase 3 progress
-- bars, we need these" and then "i think it is 13 courses ... do phase 1 first".
--
-- WHAT A PHASE IS. Thistle's courses are done in waves: a new carer works through Phase 1
-- before anything else, and a percentage against that wave answers the question a manager
-- actually asks about a starter, which is "how far through are they", not "which of thirty
-- three cells are red". Thirteen courses, and 100 / 13 is the 8% weight Monday gives each
-- ticked item on its Phase 1 bar, which is what confirmed the list.
--
-- WHY A COLUMN AND NOT A NAME SUFFIX. The board encodes the phase in the course name ("ST
-- P1", "ST P2") AND separately in each progress column's tick boxes, and the two disagree:
-- Risk Assessment is named ST P1 and excluded from the Phase 1 bar at 0% weight, while
-- Welcome to the Company carries no suffix and is included at 8%. Two places to say one
-- thing is how they drifted. Here it is one nullable column, editable in Settings.
--
-- NULL means the course is in no phase, which is what every other course is and stays.
-- Phases 2 and 3 are deliberately not seeded: Phase 1 first.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.training_courses
  add column if not exists phase smallint
    check (phase is null or phase between 1 and 3);

comment on column public.training_courses.phase is
  'Induction phase this course belongs to (1, 2 or 3). NULL means no phase.';

update public.training_courses
   set phase = 1, updated_at = now()
 where phase is null
   and name in (
     'Welcome to the Company Policy & Procedures',
     'Role of the Care Worker',
     'Communicating Effectively',
     'Dementia Care',
     'Infection Control',
     'Person Centered Care',
     'Medication L2',
     'Medication Online',
     'Safeguarding of Vulnerable Adults',
     'Fire Training',
     'Food Safety',
     'Health and Safety',
     'Manual Handling Theory'
   );

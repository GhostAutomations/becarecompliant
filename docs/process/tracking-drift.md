# Tracking drift

> Standing rule after 2026-07-27: never state what is left to build from PHASES.md or memory alone — verify against the code first

**Rule: before telling Phil an Additions item is outstanding, verify it in the CODE.
Never from PHASES.md, a kickoff prompt, or a memory note alone.**

Why: on 2026-07-27 a fresh session read the Additions "what is left" list from
ADDITIONS-ROUND3-PROMPT.md and project memory and told Phil the three biggest items were
still to build. All three were already built:

- **Invoicing increments 2+** — actually increments 1-5, signed off by Phil 2026-07-21.
  The memory index line still said "builder/lifecycle/PDF/recurring/reminders still to
  build" while the body of the same file described them as done.
- **Roles overhaul stages 2-4** — all four stages built 2026-07-16 (migrations
  0077-0081). Only per-role live TESTING is outstanding.
- **Compliance cycle redesign** — Phil caught this one himself ("if something is
  completed late, it is red"). Correct: the punctuality pill is live in
  lib/people/logic.ts and lib/service-users/logic.ts has a full reviewSlots() Rev 1-4
  cycle, and lib/export/on-time.ts scores On time vs Late. PHASES.md never logged it.

Root cause: the build outran the write-up. Work landed in code, but PHASES.md and the
memory files were not updated in the same session, so every later session inherits a
to-do list that is weeks behind reality. Phil's own kickoff prompt was generated from
those stale notes, so a fresh session cannot treat the prompt as authoritative either.

How to apply:
1. For each item claimed outstanding, read the code that would implement it before
   saying a word about it. Cheap checks: does the lib/<area> file exist, does the
   function named in the design note exist, does a grep for the rule's distinguishing
   expression hit.
2. When the bridge's `device_bash` is wedged, `device_list_dir` + `device_stage_files`
   still work, and staged files are readable in the container — byte counts from
   device_list_dir confirm a staged copy is current, which defeats the stale-uploads
   problem for READ-ONLY checks. (Never rebuild a file from a staged copy.)
3. Correct the record in the same turn: update the memory file AND the MEMORY.md index
   line, since the index line is what the next session skims.
4. When work is finished, log it to PHASES.md before moving on. An unlogged build is
   how this happened.

Phil is a reliable check on this. When he says "I think we have done some of this",
stop and verify rather than defend the plan — he was right, and it cost him a wrong
recommendation.

Related: [compliance-cycle-redesign](../decisions/compliance-cycle-redesign.md) [invoicing](../decisions/invoicing.md) [roles-overhaul](../decisions/roles-overhaul.md)

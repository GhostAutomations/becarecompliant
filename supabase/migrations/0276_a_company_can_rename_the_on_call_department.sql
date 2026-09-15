-- Be Care Compliant — a company can call the On Call department something else.
--
-- Phil, 2026-09-15: "For thistle only change On Call, to Out of Hours."
--
-- WHY A COLUMN AND NOT A HARD-CODED COMPANY ID. "Thistle only" describes who gets it, not how it
-- should be built. A company id written into lib/nav.ts is a fact about production baked into
-- source: it cannot be changed without a deploy, it is invisible to anyone reading the nav, and
-- the next provider who calls this Emergency Duty needs a second one beside it. A nullable column
-- costs the same to write, is set for exactly one company today, and is a setting we can put on a
-- screen the day somebody asks.
--
-- NULL MEANS "On Call", and that is deliberate rather than backfilling every row with the
-- default. A default written into data drifts from the default written in code the first time one
-- of them changes; null means "nobody has expressed a preference" and there is only one place
-- that decides what that resolves to.
--
-- SCOPE: the DEPARTMENT's name. The on_call ROLE is a separate label and is untouched, because
-- somebody is still the person on call whatever the department is called.

alter table companies
  add column if not exists on_call_label text
    check (on_call_label is null or length(btrim(on_call_label)) between 1 and 40);

comment on column companies.on_call_label is
  'What this company calls the On Call department, e.g. "Out of Hours". Null means the default, "On Call". Affects the nav, page titles and the dashboard; the on_call role label and the /on-call routes are unchanged.';

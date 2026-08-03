-- Be Care Compliant — 0168: a custom register column is HIDDEN until somebody asks for it.
--
-- show_on_register has defaulted to TRUE since 0074, which was harmless only because the whole
-- feature sat behind a flag. Switching the feature on with that default would have added a column
-- to every register the moment this deployed, and a column per check type from then on, with no
-- cap and no Admin decision anywhere. On the live data that is a Mentoring column showing an em
-- dash for all 42 carers, because Mentoring is ad hoc and has no due date by design.
--
-- A column now appears because an Admin turned it on in the register's Columns panel. Nothing is
-- lost: every check is still listed there, ready to be shown.
alter table public.check_definitions
  alter column show_on_register set default false;

-- Nobody has ever CHOSEN a column, so there is no preference to preserve. The flag is only read
-- for non-curated keys, but every row is reset so a key that stops being curated cannot appear
-- out of nowhere either.
update public.check_definitions set show_on_register = false where show_on_register;

comment on column public.check_definitions.show_on_register is
  'Custom register column visibility. Default FALSE: a column appears only when an Admin turns it on in the register Columns panel, which is also where the cap of 6 shown columns is enforced.';

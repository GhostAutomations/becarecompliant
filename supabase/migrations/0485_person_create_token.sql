-- 0485: Add a person cannot make two people from one form (Phil, 2026-10-15, popup "Yes, add the
-- column"; docs/decisions/add-person-documents.md).
--
-- The Add a person form carries a token made once when the form opens. The save writes it on the
-- new person; a second press of the same form (a double click, a resubmit) hits this unique index
-- and is answered with the person the first press made, so there is never a second person, a
-- second Evidence row or a second email. Empty for everyone already on the register and for every
-- other way a person is added (the CSV import, the demo seed), which do not use it.
--
-- Nothing else changes: no policy, function or trigger reads it. Safe to run twice.

alter table public.people
  add column if not exists create_token uuid;

comment on column public.people.create_token is
  'The Add a person form that made this record (0485), so pressing it twice cannot make two. Null for records made any other way.';

create unique index if not exists people_create_token_key
  on public.people (create_token)
  where create_token is not null;

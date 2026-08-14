-- =============================================================================
-- 0184 — a person files under their SURNAME.
--
-- Phil, from the Training review: "the register sorts on first name". A person has ONE
-- full_name column and every register ordered by it, so "Bethan Hughes" filed under B. A
-- manager scanning forty carers is looking for Hughes.
--
-- WHY IN THE DATABASE. Twenty-odd queries across People, Service Users, Training, Absence,
-- Complaints, Invoicing, On Call, Reg 73 and the pickers all order by full_name. Sorting in
-- TypeScript would have to be repeated in every one of them, would drift the moment somebody
-- adds the twenty-first, and would silently break if any of them is ever paginated. A stored
-- generated column means the order is a property of the row: every query gets it by naming a
-- different column, and the index makes it free.
--
-- The hard part is not splitting on a space, it is the names that do not. Dutch, Portuguese,
-- Spanish and Arabic surnames carry particles that belong WITH the surname — "van der Berg"
-- files under V, not B — and this product serves an overwhelmingly international workforce.
-- The test company alone holds Palliyaguru, Quadri-Eleruja, Ikpi-Ubi, Aladesuyi and Jepkosgei.
--
-- MIRRORED IN TYPESCRIPT at lib/people/name-sort.ts, which is unit tested. Two implementations
-- of one rule is a liability: if you change one, change the other.
-- =============================================================================

create or replace function public.surname_sort_key(p_name text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
declare
  words text[];
  n int;
  start_at int;
  particles constant text[] := array[
    'van','von','der','den','ter','ten','te',
    'de','del','della','di','da','das','do','dos','du',
    'la','le','les','lo',
    'bin','binti','binte','ibn','abu','al','el',
    'saint','st'
  ];
begin
  words := regexp_split_to_array(btrim(lower(coalesce(p_name, ''))), '\s+');
  words := array_remove(words, '');
  n := coalesce(array_length(words, 1), 0);

  -- A nameless record sorts FIRST, so somebody notices it, rather than hiding at the bottom.
  if n = 0 then return ''; end if;
  if n = 1 then return words[1]; end if;

  -- Walk left from the last word while the word before it is a particle.
  start_at := n;
  while start_at > 1 and words[start_at - 1] = any (particles) loop
    start_at := start_at - 1;
  end loop;
  -- Never swallow the whole name: "de Souza" keeps a surname rather than becoming unsortable.
  if start_at = 1 then start_at := n; end if;

  return btrim(
    array_to_string(words[start_at:n], ' ') || ' ' ||
    array_to_string(words[1:start_at - 1], ' ')
  );
end;
$$;

alter table public.people
  add column if not exists surname_key text
  generated always as (public.surname_sort_key(full_name)) stored;

alter table public.service_users
  add column if not exists surname_key text
  generated always as (public.surname_sort_key(full_name)) stored;

create index if not exists people_surname_key_idx
  on public.people (company_id, surname_key);
create index if not exists service_users_surname_key_idx
  on public.service_users (company_id, surname_key);

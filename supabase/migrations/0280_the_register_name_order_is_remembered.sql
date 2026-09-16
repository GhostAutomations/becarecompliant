-- THE NAME ORDER IS THE USER'S, AND IT KEEPS.
--
-- Phil, 2026-09-16: "default is A-Z First Name, when it is change it stays like that until
-- they change it, even when they log out."
--
-- Stored per user on profiles, like planner_view (0108), rather than in the browser: "even
-- when they log out" means it has to survive a different machine and a cleared browser, and
-- a manager who works from the office desktop and a laptop should not have to set it twice.
--
-- ONE setting across all three registers, People, Service Users and Training, because the
-- whole point of the shared header is that the three behave the same. Somebody who thinks in
-- first names thinks in first names on every page.
--
-- Default 'first_az' for everybody, existing rows included: the registers arrive ordered by
-- surname_key, so this is the one change where the default deliberately differs from what the
-- database does, and the client re-sorts on arrival.
alter table public.profiles
  add column if not exists register_name_sort text not null default 'first_az'
    check (register_name_sort in ('first_az', 'first_za', 'surname_az', 'surname_za'));

create or replace function public.set_register_name_sort(v text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if v not in ('first_az', 'first_za', 'surname_az', 'surname_za') then
    raise exception 'invalid register name sort';
  end if;
  update public.profiles set register_name_sort = v where id = auth.uid();
end;
$$;

revoke all on function public.set_register_name_sort(text) from public;
grant execute on function public.set_register_name_sort(text) to authenticated;

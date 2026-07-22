-- 0108_planner_view
-- Remember each user's My Planner view choice (Calendar or List) so it persists
-- across page changes and across logout/login. Stored per user on profiles.
-- set via a SECURITY DEFINER RPC that only ever updates the caller's own row.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.profiles
  add column if not exists planner_view text not null default 'calendar'
    check (planner_view in ('calendar', 'list'));

create or replace function public.set_planner_view(v text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if v not in ('calendar', 'list') then
    raise exception 'invalid planner view';
  end if;
  update public.profiles set planner_view = v where id = auth.uid();
end;
$$;

revoke all on function public.set_planner_view(text) from public;
grant execute on function public.set_planner_view(text) to authenticated;

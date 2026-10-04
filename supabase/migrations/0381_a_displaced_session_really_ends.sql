-- Audit S6 (4 Oct 2026). One desktop and one mobile session per login (0273) was enforced only
-- by the website: requireUser signed a displaced device out when it next opened a page. Until
-- then, and for anything that talked to Supabase directly, the old device's refresh token kept
-- working indefinitely.
--
-- Now claiming a slot ENDS the session it displaces: its auth.sessions row is deleted, which
-- revokes its refresh token, so it cannot be renewed. Its current access token still verifies
-- until it expires (at most an hour), which is how Supabase access tokens work.
--
-- The displaced session id is also remembered, so the middleware can tell that device
-- "You've been signed out because your account was signed in elsewhere" instead of a bare
-- sign in page. Kept 30 days.

create table if not exists public.displaced_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  displaced_at timestamptz not null default now()
);
alter table public.displaced_sessions enable row level security;
-- No policies: read only through was_session_displaced below.
comment on table public.displaced_sessions is
  'Sessions ended because the same login signed in on another device of the same kind (0381). Read through was_session_displaced only.';

create or replace function public.claim_session(p_session_id uuid, p_device_kind text default 'desktop')
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind text := case when p_device_kind = 'mobile' then 'mobile' else 'desktop' end;
  v_old uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select session_id into v_old
    from public.user_sessions
   where user_id = auth.uid() and device_kind = v_kind;

  insert into public.user_sessions (user_id, session_id, signed_in_at, device_kind)
  values (auth.uid(), p_session_id, now(), v_kind)
  on conflict (user_id, device_kind) do update
    set session_id = excluded.session_id,
        signed_in_at = now();

  -- Only ever the caller's own session, and never the one claiming.
  if v_old is not null and v_old is distinct from p_session_id then
    insert into public.displaced_sessions (session_id, user_id)
    values (v_old, auth.uid())
    on conflict (session_id) do nothing;
    delete from auth.sessions where id = v_old and user_id = auth.uid();
  end if;

  delete from public.displaced_sessions where displaced_at < now() - interval '30 days';
end;
$function$;

-- Anyone may ask about one session id: it answers yes or no and nothing else, and a session id
-- is a random UUID that only the device holding it knows. The middleware asks with the anon
-- key, because the device it is asking about has, by definition, lost its session.
create or replace function public.was_session_displaced(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.displaced_sessions where session_id = p_session_id);
$function$;

revoke all on function public.was_session_displaced(uuid) from public;
grant execute on function public.was_session_displaced(uuid) to anon, authenticated;

-- Sessions already displaced before this ran: a login holding a slot, with a live session that
-- is in neither slot. requireUser would sign each out on its next page; end them now instead.
insert into public.displaced_sessions (session_id, user_id)
select s.id, s.user_id
  from auth.sessions s
 where exists (select 1 from public.user_sessions u where u.user_id = s.user_id)
   and not exists (select 1 from public.user_sessions u where u.session_id = s.id)
on conflict (session_id) do nothing;

delete from auth.sessions s
 where exists (select 1 from public.user_sessions u where u.user_id = s.user_id)
   and not exists (select 1 from public.user_sessions u where u.session_id = s.id);

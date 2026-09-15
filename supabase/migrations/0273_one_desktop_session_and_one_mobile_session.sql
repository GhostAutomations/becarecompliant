-- Be Care Compliant — one desktop session and one mobile session, instead of one full stop.
--
-- Phil, 2026-09-15, after tapping a task link from his iPhone calendar and being told he had
-- been signed in elsewhere. BCC allowed exactly ONE session per person. That was sound while it
-- was a desktop product. Putting task links in people's calendars changed the arithmetic: every
-- tap on a phone signed them out of their laptop, and going back to the laptop signed them out
-- of the phone, so the more useful the calendar became the more often people typed a password.
--
-- WHAT THE ORIGINAL RULE WAS PROTECTING, and what is kept. Single session meant a password
-- shared with a colleague, or a browser left signed in somewhere it should not be, got NOTICED,
-- because somebody was abruptly kicked out. Two slots keeps exactly that: a second phone still
-- evicts the first phone, a second computer still evicts the first computer. What changes is
-- that a person's own phone and their own computer no longer fight each other. This buys ONE
-- extra concurrent device, not an unlimited number.
--
-- WHY THE KEY IS THE DEVICE KIND AND NOT A COUNT. "Up to two sessions" would let two colleagues
-- share one password and sit on a slot each indefinitely, which is the thing being guarded
-- against. Keyed by kind, the second phone always displaces the first, so a shared password
-- still produces the tell.
--
-- THE HONEST LIMIT. Device kind comes from the User-Agent, which is a claim the client makes,
-- not a fact. Someone editing theirs can hold both slots from one machine: two sessions rather
-- than one, for the account's own owner, which is what this migration decided to allow anyway.
-- It is not a route into anyone else's account and it gates no permission. See
-- lib/auth/device-kind.ts, which says the same thing to whoever reads the code first.

alter table user_sessions
  add column if not exists device_kind text not null default 'desktop'
    check (device_kind in ('desktop', 'mobile'));

comment on column user_sessions.device_kind is
  'Which slot this session occupies. One desktop and one mobile per person. Derived from the User-Agent, which is a client claim: this decides which of your own slots a session takes, never what you are allowed to do.';

-- The primary key moves from the person to the person-and-slot. Existing rows keep their
-- session and become that person's desktop slot, so nobody signed in right now is disturbed.
alter table user_sessions drop constraint if exists user_sessions_pkey;
alter table user_sessions add primary key (user_id, device_kind);

create index if not exists user_sessions_session_idx on user_sessions (session_id);

-- Claim the slot for THIS kind of device, leaving the other kind alone. The old version
-- conflicted on user_id and so overwrote whatever else the person had open.
create or replace function public.claim_session(p_session_id uuid, p_device_kind text default 'desktop')
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kind text := case when p_device_kind = 'mobile' then 'mobile' else 'desktop' end;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_sessions (user_id, session_id, signed_in_at, device_kind)
  values (auth.uid(), p_session_id, now(), v_kind)
  on conflict (user_id, device_kind) do update
    set session_id = excluded.session_id,
        signed_in_at = now();
end;
$function$;

-- The single-argument form is dropped so no caller can quietly keep the old behaviour: it
-- conflicted on user_id alone, which no longer matches the primary key.
drop function if exists public.claim_session(uuid);

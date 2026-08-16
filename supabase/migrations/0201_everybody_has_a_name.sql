/*
 * 0201. full_name is genuinely required.
 *
 * It was NOT NULL DEFAULT '', which means a nameless profile has always been legal, and one
 * exists. Every name lookup therefore had to carry a fallback, and the fallback we chose is the
 * email address. That is fine on a dropdown and NOT fine on a Regulation 73 branch visit report,
 * where the chosen string is stored and printed: the report would be signed off by an inbox,
 * permanently, on a document a regulator reads.
 *
 * So the blank case stops existing.
 *
 * Order matters. Backfill first, then harden the ONE insert path, then constrain. A CHECK is
 * re-validated on every UPDATE of the row whatever columns are named, so leaving a blank row
 * behind would have broken setUserStatus, changeUserRole, revokeInvite, the phone number field
 * and set_planner_view for that user, several of which swallow the error.
 */

-- 1. Backfill. One row: the founder's own account, created before there was a form to name it.
update public.profiles
set full_name = 'Phil Davies'
where id = 'cb252ec0-4c6a-4656-a562-3f942f795acf' and btrim(full_name) = '';

-- Anybody else blank (there is nobody today) gets their address rather than a made up name.
update public.profiles
set full_name = email
where btrim(full_name) = '' and btrim(coalesce(email, '')) <> '';

/*
 * 2. The only INSERT into profiles in the entire system: the auth.users trigger. It read
 *    coalesce(raw_user_meta_data ->> 'full_name', ''), which writes a blank whenever the key is
 *    absent OR empty, and the magic link branch of generateConfirmUrl passes no metadata at all.
 *    Under the new constraint that is not a bad name, it is a failed signup: GoTrue reports
 *    "Database error creating new user" and no account is created.
 *
 *    The app now refuses a blank name at the single door every invite goes through, so this
 *    fallback should be unreachable. It exists so that a path we have not thought of degrades to
 *    an ugly name rather than to nobody being able to sign in.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.email), ''),
      'New user'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. The constraint itself.
alter table public.profiles
  add constraint profiles_full_name_not_blank check (btrim(full_name) <> '');

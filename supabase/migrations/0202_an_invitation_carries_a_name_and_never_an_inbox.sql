/*
 * 0202. Two corrections to 0201.
 *
 * 1. AN INVITE COULD STILL CARRY A BLANK. invites.full_name is text not null default '', and
 *    both resend paths hand it straight to generateLink, which is what creates the auth user.
 *    So a pending invite written before names were required could still produce a nameless
 *    signup. The app refuses it now; this stops the column holding one in the first place.
 *
 * 2. THE FALLBACK WROTE THE VERY THING WE WERE REMOVING. 0201 made handle_new_user fall back to
 *    the email address, and its backfill did the same. The whole point of the exercise was that
 *    an address must never end up printed as the signatory of a Regulation 73 or 80 report, and
 *    the picker filter that used to keep it off one was removed in the same change. So the
 *    fallback is now a placeholder that is obviously not a person: if it ever reaches a screen
 *    it reads as the defect it is, rather than passing for a name.
 */

update public.invites set full_name = btrim(full_name) where full_name <> btrim(full_name);

-- Nobody is in this state today. A restored snapshot might be.
update public.invites set full_name = 'Name not set' where btrim(full_name) = '';

alter table public.invites
  add constraint invites_full_name_not_blank check (btrim(full_name) <> '');

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
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Name not set')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

/*
 * And the same for anybody 0201's second backfill arm named after their inbox. It wrote no rows
 * in production; this makes the pair of migrations safe to run against a copy that is not
 * production, where it might have.
 */
update public.profiles
set full_name = 'Name not set'
where btrim(full_name) <> '' and btrim(full_name) = btrim(coalesce(email, ''));

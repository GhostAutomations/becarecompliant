-- 0178_created_by_is_never_the_discloser
--
-- A DEFECT IN 0177, found by looking at the two rows the live test had produced rather than
-- at the code, which read as correct.
--
-- created_by meant two different things depending on how the disclosure arrived:
--
--   Admin typed it up      -> created_by is the ADMIN. Provenance. Harmless.
--   Staff raised it, named -> created_by is the DISCLOSER. A second copy of their identity,
--                             in a column nobody thinks of as holding one.
--
-- Two things follow, and the second is the serious one:
--
--   1. Any future export or screen that renders "raised by <created_by>" would name the
--      Admin as the discloser on half the rows and the actual discloser on the other half.
--
--   2. updateDisclosure clears discloser_name when the Admin unticks "gave their name" - and
--      never touched created_by. So a staff-raised NAMED disclosure that was later made
--      anonymous kept a foreign key straight to the person. I told Phil "untick it and the
--      name is deleted, not hidden". On that path it was not true.
--
-- So: created_by NEVER holds the discloser. On the staff route it is always null - the name,
-- when given, lives in discloser_name and nowhere else, which is the one column every piece
-- of code already treats as identifying. Nothing is lost: who raised it is either in
-- discloser_name or deliberately unknown, and who TYPED IT UP is in audit_log.
--
-- The app side matches: identityFields() in lib/whistleblowing/actions.ts now sets
-- created_by to null whenever a disclosure is anonymous, on create and on edit, so the rule
-- is "an anonymous disclosure holds no identity in any column" with no exceptions.

create or replace function public.raise_whistleblowing_concern(
  p_category text,
  p_disclosure text,
  p_named boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_name text;
  v_named boolean := coalesce(p_named, false);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to raise a concern.';
  end if;

  select p.company_id, p.full_name
    into v_company, v_name
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  if v_company is null then
    raise exception 'Your login is not attached to a company.';
  end if;

  if coalesce(btrim(p_disclosure), '') = '' then
    raise exception 'Please describe the concern.';
  end if;

  insert into public.whistleblowing_disclosures (
    company_id,
    branch_id,
    received_on,
    anonymous,
    discloser_name,
    category,
    disclosure,
    status,
    created_by
  ) values (
    v_company,
    -- Deliberately null even though we know their branch: on a branch of six, the branch
    -- narrows the discloser to six people.
    null,
    (now() at time zone 'Europe/London')::date,
    not v_named,
    case when v_named then v_name else null end,
    coalesce(nullif(btrim(p_category), ''), 'Other'),
    btrim(p_disclosure),
    'open',
    -- ALWAYS NULL on this route, named or not. See the note at the top: created_by must
    -- never be a second, unwatched copy of the discloser's identity.
    null
  );
end;
$$;

comment on column public.whistleblowing_disclosures.created_by is
  'The person who TYPED THE DISCLOSURE UP, never the person who made it. Null for anything raised through the Team Member area. Cleared whenever a disclosure is anonymous.';

-- Bring existing rows into line with the rule: an anonymous disclosure holds no identity of
-- any kind, in any column.
update public.whistleblowing_disclosures
set created_by = null
where anonymous and created_by is not null;

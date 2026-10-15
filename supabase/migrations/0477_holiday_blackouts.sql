-- 0477: Holiday blackout dates (Phil, 2026-10-15; docs/decisions/holiday-blackouts.md).
--
-- Periods when holidays can't be booked, set by the Company Admin, Responsible Individual or
-- Registered Manager (and the Founder), for some branches or all of them, with a reason staff see.
--
--  1. holiday_blackouts + holiday_blackout_branches. Read by the company's people for their own
--     branches (everyone for an "All branches" one); written only through save_holiday_blackout /
--     delete_holiday_blackout, which check the role inside and write the audit log.
--  2. holiday_blackout_clash(): THE one check (holiday_blackout_check() asks it for the screens
--     before anything is saved). holiday_blackout_message() words it:
--     "Holidays can't be booked 20 Dec to 2 Jan 2027: Christmas cover."
--  3. holiday_requests_blackout: a BEFORE INSERT OR UPDATE trigger on holiday_requests, so every
--     way a holiday is made or moved is covered, the public no login form and the Demo builder
--     included, with no entry point able to forget it. It checks:
--       a new holiday (pending or approved);
--       new dates on a live holiday (the office's Edit dates, a carer's Change dates), except
--       putting back the dates already agreed (declining a change);
--       a pending request being approved for the first time (one made before the blackout).
--     It never checks a cancel, a decline, a withdrawal, or an approved holiday left alone, so
--     approved holidays already in a blackout stay approved.
--  4. "Book anyway": Company Admin, Responsible Individual, Registered Manager and the Founder
--     only, with a reason. On a booking the reason travels on the new row; on Approve and Edit
--     dates it travels through decide_holiday_request_anyway / amend_holiday_request_anyway, which
--     set it for this transaction only and call the existing functions unchanged. The reason, who
--     and when are stamped on the holiday (blackout_override_*) and audit logged. A Branch Manager
--     can decline a clashing request but not approve it (Phil, popup).
--  5. Live: the 0418 broadcast triggers on holiday_blackouts.
-- Existing holiday rows are not changed: the three new columns start empty.

-- 1.
create table if not exists public.holiday_blackouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (length(btrim(reason)) between 2 and 120),
  all_branches boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint holiday_blackouts_dates check (end_date >= start_date)
);
create index if not exists holiday_blackouts_company_idx on public.holiday_blackouts (company_id, end_date);

create table if not exists public.holiday_blackout_branches (
  blackout_id uuid not null references public.holiday_blackouts(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (blackout_id, branch_id)
);
create index if not exists holiday_blackout_branches_branch_idx on public.holiday_blackout_branches (branch_id);

-- Can this login see this blackout: the Founder, a company wide role, an "All branches" one, or
-- one covering a branch they belong to (their login's branches or their People record's branch).
create or replace function public.holiday_blackout_visible(p_blackout uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.holiday_blackouts hb
     where hb.id = p_blackout
       and public.is_company_member(hb.company_id)
       and (
         public.is_platform_admin()
         or public.is_company_wide(hb.company_id)
         or hb.all_branches
         or exists (
           select 1 from public.holiday_blackout_branches bb
            where bb.blackout_id = hb.id
              and (bb.branch_id in (select ub.branch_id from public.user_branches ub where ub.user_id = auth.uid())
                   or bb.branch_id in (select pe.branch_id from public.people pe where pe.profile_id = auth.uid()))
         )
       )
  ) or public.is_platform_admin();
$$;
revoke all on function public.holiday_blackout_visible(uuid) from public, anon;
grant execute on function public.holiday_blackout_visible(uuid) to authenticated;

alter table public.holiday_blackouts enable row level security;
alter table public.holiday_blackout_branches enable row level security;
drop policy if exists holiday_blackouts_select on public.holiday_blackouts;
create policy holiday_blackouts_select on public.holiday_blackouts
  for select to authenticated using (public.holiday_blackout_visible(id));
drop policy if exists holiday_blackout_branches_select on public.holiday_blackout_branches;
create policy holiday_blackout_branches_select on public.holiday_blackout_branches
  for select to authenticated using (public.holiday_blackout_visible(blackout_id));
revoke all on public.holiday_blackouts, public.holiday_blackout_branches from anon;
revoke insert, update, delete, truncate on public.holiday_blackouts, public.holiday_blackout_branches from authenticated;

-- 2.
-- The first blackout a holiday's days fall in, for its branch. A holiday with no branch only
-- meets "All branches" blackouts.
create or replace function public.holiday_blackout_clash(p_company uuid, p_branch uuid, p_start date, p_end date)
returns table (blackout_id uuid, start_date date, end_date date, reason text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hb.id, hb.start_date, hb.end_date, hb.reason
    from public.holiday_blackouts hb
   where hb.company_id = p_company
     and hb.start_date <= p_end
     and hb.end_date >= p_start
     and (hb.all_branches
          or (p_branch is not null and exists (
                select 1 from public.holiday_blackout_branches bb
                 where bb.blackout_id = hb.id and bb.branch_id = p_branch)))
   order by hb.start_date, hb.end_date
   limit 1;
$$;
revoke all on function public.holiday_blackout_clash(uuid, uuid, date, date) from public, anon, authenticated;

-- "Holidays can't be booked 20 Dec to 2 Jan 2027: Christmas cover." / "... on 25 Dec 2026: ..."
create or replace function public.holiday_blackout_message(p_start date, p_end date, p_reason text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_start = p_end then
      'Holidays can''t be booked on ' || to_char(p_start, 'FMDD Mon YYYY') || ': ' || btrim(p_reason) || '.'
    else
      'Holidays can''t be booked ' || to_char(p_start, 'FMDD Mon') || ' to ' || to_char(p_end, 'FMDD Mon YYYY') || ': ' || btrim(p_reason) || '.'
  end;
$$;

-- The same check for the screens to ask BEFORE anything is saved (a booking stores its form as
-- Evidence first, and a refusal after that would leave the form behind): the message, or null when
-- the dates are clear. Company members for their own company, and the service role.
create or replace function public.holiday_blackout_check(p_company uuid, p_branch uuid, p_start date, p_end date)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if auth.uid() is not null and not (public.is_company_member(p_company) or public.is_platform_admin()) then
    raise exception 'Not a member of this company.' using errcode = '42501';
  end if;
  select * into c from public.holiday_blackout_clash(p_company, p_branch, p_start, p_end);
  if c.blackout_id is null then
    return null;
  end if;
  return public.holiday_blackout_message(c.start_date, c.end_date, c.reason);
end;
$$;
revoke all on function public.holiday_blackout_check(uuid, uuid, date, date) from public, anon;
grant execute on function public.holiday_blackout_check(uuid, uuid, date, date) to authenticated, service_role;

-- 3 and 4.
alter table public.holiday_requests add column if not exists blackout_override_reason text;
alter table public.holiday_requests add column if not exists blackout_override_by uuid references public.profiles(id) on delete set null;
alter table public.holiday_requests add column if not exists blackout_override_at timestamptz;

create or replace function public.holiday_requests_blackout()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check boolean;
  c record;
  v_override text;
begin
  if tg_op = 'INSERT' then
    v_check := new.status in ('pending', 'approved');
    v_override := nullif(btrim(coalesce(new.blackout_override_reason, '')), '');
  else
    v_check :=
      (new.status in ('pending', 'approved')
        and (new.start_date, new.end_date) is distinct from (old.start_date, old.end_date)
        and not (new.start_date is not distinct from old.previous_start_date
                 and new.end_date is not distinct from old.previous_end_date))
      or (old.status = 'pending' and new.status = 'approved' and old.change_kind is null);
    -- On a change only the override given for THIS change counts, never one stamped earlier.
    v_override := nullif(btrim(coalesce(current_setting('bcc.blackout_override', true), '')), '');
  end if;

  if v_check then
    select * into c from public.holiday_blackout_clash(new.company_id, new.branch_id, new.start_date, new.end_date);
  end if;

  if not v_check or c.blackout_id is null then
    -- Nothing to override: an insert keeps no stray reason; a change keeps what it had.
    if tg_op = 'INSERT' then
      new.blackout_override_reason := null;
      new.blackout_override_by := null;
      new.blackout_override_at := null;
    else
      new.blackout_override_reason := old.blackout_override_reason;
      new.blackout_override_by := old.blackout_override_by;
      new.blackout_override_at := old.blackout_override_at;
    end if;
    return new;
  end if;

  if v_override is not null and auth.uid() is not null
     and (public.is_platform_admin() or public.is_company_wide(new.company_id)) then
    new.blackout_override_reason := left(v_override, 300);
    new.blackout_override_by := auth.uid();
    new.blackout_override_at := now();
    insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
    values (new.company_id, auth.uid(),
            (select pr.role from public.profiles pr where pr.id = auth.uid()),
            'holiday.blackout_override', 'holiday_request', new.id::text,
            'Booked anyway inside a blackout: ' || left(v_override, 200),
            jsonb_build_object('blackout_id', c.blackout_id, 'start_date', new.start_date, 'end_date', new.end_date,
                               'reason', v_override, 'status', new.status));
    return new;
  end if;

  raise exception '%', public.holiday_blackout_message(c.start_date, c.end_date, c.reason)
    using errcode = 'check_violation', detail = 'holiday_blackout';
end;
$$;
revoke all on function public.holiday_requests_blackout() from public, anon, authenticated;

drop trigger if exists holiday_requests_blackout on public.holiday_requests;
create trigger holiday_requests_blackout
  before insert or update of start_date, end_date, status on public.holiday_requests
  for each row execute function public.holiday_requests_blackout();

-- Approve anyway / Edit dates anyway: the existing functions, unchanged, with the reason set for
-- this transaction only. Admin, Responsible Individual, Registered Manager and the Founder.
create or replace function public.decide_holiday_request_anyway(p_id uuid, p_evidence_id uuid, p_note text, p_override_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.holiday_requests where id = p_id;
  if v_company is null or not (public.is_platform_admin() or public.is_company_wide(v_company)) then
    raise exception 'Only an Admin, Responsible Individual or Registered Manager can book a holiday inside a blackout.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_override_reason, '')), '') is null then
    raise exception 'Give a short reason for booking inside the blackout.' using errcode = '22023';
  end if;
  perform set_config('bcc.blackout_override', btrim(p_override_reason), true);
  perform public.decide_holiday_request(p_id, 'approved', p_evidence_id, p_note);
  perform set_config('bcc.blackout_override', '', true);
end;
$$;
revoke all on function public.decide_holiday_request_anyway(uuid, uuid, text, text) from public, anon;
grant execute on function public.decide_holiday_request_anyway(uuid, uuid, text, text) to authenticated;

create or replace function public.amend_holiday_request_anyway(p_id uuid, p_start_date date, p_end_date date, p_reason text, p_return_to_work date, p_override_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.holiday_requests where id = p_id;
  if v_company is null or not (public.is_platform_admin() or public.is_company_wide(v_company)) then
    raise exception 'Only an Admin, Responsible Individual or Registered Manager can book a holiday inside a blackout.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_override_reason, '')), '') is null then
    raise exception 'Give a short reason for booking inside the blackout.' using errcode = '22023';
  end if;
  perform set_config('bcc.blackout_override', btrim(p_override_reason), true);
  perform public.amend_holiday_request(p_id, p_start_date, p_end_date, p_reason, p_return_to_work);
  perform set_config('bcc.blackout_override', '', true);
end;
$$;
revoke all on function public.amend_holiday_request_anyway(uuid, date, date, text, date, text) from public, anon;
grant execute on function public.amend_holiday_request_anyway(uuid, date, date, text, date, text) to authenticated;

-- 1 (continued). Managing blackouts: Company Admin, Responsible Individual, Registered Manager,
-- the Founder. p_id null makes a new one. p_branch_ids is ignored when p_all_branches.
create or replace function public.save_holiday_blackout(
  p_company uuid, p_id uuid, p_start date, p_end date, p_reason text, p_all_branches boolean, p_branch_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
  v_before jsonb;
  v_branches uuid[] := coalesce(p_branch_ids, '{}');
begin
  if not (public.is_platform_admin() or public.is_company_wide(p_company)) then
    raise exception 'Only an Admin, Responsible Individual or Registered Manager can set blackout dates.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Choose the first and last day.' using errcode = '22023';
  end if;
  if p_end < p_start then
    raise exception 'The last day cannot be before the first day.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 2 then
    raise exception 'Give the reason staff will see, for example Christmas cover.' using errcode = '22023';
  end if;
  if length(btrim(p_reason)) > 120 then
    raise exception 'Keep the reason to 120 characters.' using errcode = '22023';
  end if;
  if not coalesce(p_all_branches, false) then
    if cardinality(v_branches) = 0 then
      raise exception 'Choose at least one branch, or All branches.' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_branches) b(id)
                where not exists (select 1 from public.branches br where br.id = b.id and br.company_id = p_company)) then
      raise exception 'That branch is not in this company.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.holiday_blackouts (company_id, start_date, end_date, reason, all_branches, created_by, updated_by)
    values (p_company, p_start, p_end, btrim(p_reason), coalesce(p_all_branches, false), auth.uid(), auth.uid())
    returning id into v_id;
  else
    select jsonb_build_object('start_date', hb.start_date, 'end_date', hb.end_date, 'reason', hb.reason, 'all_branches', hb.all_branches,
                              'branch_ids', (select coalesce(jsonb_agg(bb.branch_id), '[]'::jsonb) from public.holiday_blackout_branches bb where bb.blackout_id = hb.id))
      into v_before
      from public.holiday_blackouts hb where hb.id = v_id and hb.company_id = p_company;
    if v_before is null then
      raise exception 'That blackout was not found.' using errcode = '22023';
    end if;
    update public.holiday_blackouts
       set start_date = p_start, end_date = p_end, reason = btrim(p_reason), all_branches = coalesce(p_all_branches, false),
           updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    delete from public.holiday_blackout_branches where blackout_id = v_id;
  end if;

  if not coalesce(p_all_branches, false) then
    insert into public.holiday_blackout_branches (blackout_id, branch_id, company_id)
    select v_id, b.id, p_company from (select distinct unnest(v_branches) as id) b;
  end if;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (p_company, auth.uid(), (select pr.role from public.profiles pr where pr.id = auth.uid()),
          case when p_id is null then 'holiday.blackout_added' else 'holiday.blackout_changed' end,
          'holiday_blackout', v_id::text,
          public.holiday_blackout_message(p_start, p_end, p_reason),
          jsonb_build_object('start_date', p_start, 'end_date', p_end, 'reason', btrim(p_reason),
                             'all_branches', coalesce(p_all_branches, false), 'branch_ids', to_jsonb(v_branches), 'before', v_before));
  return v_id;
end;
$$;
revoke all on function public.save_holiday_blackout(uuid, uuid, date, date, text, boolean, uuid[]) from public, anon;
grant execute on function public.save_holiday_blackout(uuid, uuid, date, date, text, boolean, uuid[]) to authenticated;

create or replace function public.delete_holiday_blackout(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hb public.holiday_blackouts;
begin
  select * into hb from public.holiday_blackouts where id = p_id;
  if hb.id is null then
    raise exception 'That blackout was not found.' using errcode = '22023';
  end if;
  if not (public.is_platform_admin() or public.is_company_wide(hb.company_id)) then
    raise exception 'Only an Admin, Responsible Individual or Registered Manager can remove blackout dates.' using errcode = '42501';
  end if;
  delete from public.holiday_blackouts where id = p_id;
  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (hb.company_id, auth.uid(), (select pr.role from public.profiles pr where pr.id = auth.uid()),
          'holiday.blackout_removed', 'holiday_blackout', hb.id::text,
          'Removed: ' || public.holiday_blackout_message(hb.start_date, hb.end_date, hb.reason),
          jsonb_build_object('start_date', hb.start_date, 'end_date', hb.end_date, 'reason', hb.reason, 'all_branches', hb.all_branches));
end;
$$;
revoke all on function public.delete_holiday_blackout(uuid) from public, anon;
grant execute on function public.delete_holiday_blackout(uuid) to authenticated;

-- 5.
drop trigger if exists bcc_live_ins on public.holiday_blackouts;
drop trigger if exists bcc_live_upd on public.holiday_blackouts;
drop trigger if exists bcc_live_del on public.holiday_blackouts;
create trigger bcc_live_ins after insert on public.holiday_blackouts
  referencing new table as new_rows for each statement execute function public.bcc_broadcast_change();
create trigger bcc_live_upd after update on public.holiday_blackouts
  referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change();
create trigger bcc_live_del after delete on public.holiday_blackouts
  referencing old table as old_rows for each statement execute function public.bcc_broadcast_change();

-- Records stay in their own company (0443).
select public.install_company_link_triggers();

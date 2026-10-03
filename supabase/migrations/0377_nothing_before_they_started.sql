-- 0377_nothing_before_they_started (snag S19, Phil 3 Oct 2026, popup: refuse it)
--
-- Smith Tacho Azang started on 21 April 2026 but carried a supervision done on 31 December 2025,
-- loaded from the monday board on 19 September. The register took it as his Supervision 1 and
-- showed Supervision 2 overdue since March. A supervision, an appraisal or a probation outcome can
-- only happen while someone works here, so the database refuses one dated before the start date,
-- whichever way it arrives: completing the check, a paper copy, the import, the history boxes on
-- Add a person, or a hand written data load. The app refuses it first with the same words
-- (lib/people/before-start.ts); this is the backstop. Training and competencies are not covered,
-- they can come from a previous job. Existing rows are untouched (checked: one, Smith's, which
-- Phil removes). Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.refuse_before_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid;
  v_key text;
  v_date date;
  v_start date;
  v_what text;
begin
  if tg_table_name = 'migrated_completions' then
    if new.record_type <> 'person' then return new; end if;
    v_person := new.record_id;
    select key, name into v_key, v_what from public.check_definitions where id = new.definition_id;
    if v_key not in ('supervision', 'appraisal') then return new; end if;
    v_date := new.completed_on;
  elsif tg_table_name = 'check_instances' then
    if new.person_id is null or new.last_completed_on is null
       or new.last_completed_on is not distinct from old.last_completed_on then return new; end if;
    v_person := new.person_id;
    select key, name into v_key, v_what from public.check_definitions where id = new.definition_id;
    if v_key not in ('supervision', 'appraisal') then return new; end if;
    v_date := new.last_completed_on;
  elsif tg_table_name = 'person_trackers' then
    v_person := new.person_id;
    if new.probation_end_actual is not null
       and new.probation_end_actual is distinct from old.probation_end_actual then
      v_date := new.probation_end_actual; v_what := 'probation end';
    elsif new.probation_extension_date is not null
       and new.probation_extension_date is distinct from old.probation_extension_date then
      v_date := new.probation_extension_date; v_what := 'probation extension';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select start_date into v_start from public.people where id = v_person;
  if v_start is not null and v_date < v_start then
    raise exception 'The % date, %, is before this person started on %. Check the date and try again.',
      v_what, to_char(v_date, 'FMDD FMMonth YYYY'), to_char(v_start, 'FMDD FMMonth YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_before_start() from public, anon, authenticated;

drop trigger if exists migrated_completions_not_before_start on public.migrated_completions;
create trigger migrated_completions_not_before_start
  before insert or update on public.migrated_completions
  for each row execute function public.refuse_before_start();

drop trigger if exists check_instances_not_before_start on public.check_instances;
create trigger check_instances_not_before_start
  before update of last_completed_on on public.check_instances
  for each row execute function public.refuse_before_start();

drop trigger if exists person_trackers_not_before_start on public.person_trackers;
create trigger person_trackers_not_before_start
  before update of probation_end_actual, probation_extension_date on public.person_trackers
  for each row execute function public.refuse_before_start();

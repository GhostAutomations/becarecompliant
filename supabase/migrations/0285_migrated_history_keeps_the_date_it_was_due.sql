-- MIGRATED HISTORY KEEPS THE DATE IT WAS DUE, AND AN IMPORT MAY SUPPLY THE NEXT DUE.
--
-- Phil, 2026-09-16: "use the upload form but add in and due and comp columns".
--
-- WHY. The board a company arrives from holds a DUE and a COMP for every review. We were
-- taking only the COMP and recalculating every due date from our own recurrence rule. Two
-- problems with that, both already seen on real data this week: the rules disagree (Spot
-- Check is 30 days here and 28 on their board), so the imported register contradicts the
-- system it was copied from on day one; and a completion with no due date beside it cannot
-- answer "was it done on time", which is the question an inspection actually asks. A history
-- that cannot be judged late is a history that reads as if nothing was ever late.
--
-- due_on is NULLABLE and stays null for every row imported before today. Null means "we do
-- not know when this was due", which is the truth about those rows - not "it was on time".
--
-- p_due_on and p_next_due are separate arguments on purpose. p_due_on belongs to the
-- completion being recorded; p_next_due is the open check's date. Collapsing them is how a
-- completed review's own deadline ends up presented as the next one.
--
-- The new argument has a DEFAULT so the existing three call sites keep working unchanged:
-- a signature change that silently breaks a caller is worse than the column it adds.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.migrated_completions
  add column if not exists due_on date;

comment on column public.migrated_completions.due_on is
  'The date this completion was DUE, when the import supplied it. NULL means unknown, never on time.';

create or replace function public.seed_migrated_completion(
  p_record_type text,
  p_record_id uuid,
  p_definition_id uuid,
  p_completed_on date,
  p_next_due date,
  p_is_latest boolean,
  p_due_on date default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
  v_branch uuid;
begin
  if p_record_type = 'person' then
    select company_id, branch_id into v_company, v_branch from public.people where id = p_record_id;
  elsif p_record_type = 'service_user' then
    select company_id, branch_id into v_company, v_branch from public.service_users where id = p_record_id;
  else
    raise exception 'invalid record_type %', p_record_type;
  end if;
  if v_company is null then raise exception 'record not found'; end if;
  if not (public.is_company_admin(v_company) or public.is_platform_admin()) then
    raise exception 'not authorised';
  end if;

  insert into public.migrated_completions(
    company_id, branch_id, record_type, record_id, definition_id, completed_on, due_on, created_by
  ) values (
    v_company, v_branch, p_record_type, p_record_id, p_definition_id, p_completed_on, p_due_on, auth.uid()
  )
  -- A re-run may now carry a due date where the first run had none. Filling a null is not
  -- the same as overwriting an answer, so only a null is filled.
  on conflict (record_id, definition_id, completed_on)
    do update set due_on = coalesce(public.migrated_completions.due_on, excluded.due_on);

  if p_is_latest then
    if p_record_type = 'person' then
      update public.check_instances
        set last_completed_on = p_completed_on, due_date = p_next_due,
            last_evidence_id = null, updated_at = now()
        where person_id = p_record_id and definition_id = p_definition_id;
    else
      update public.check_instances
        set last_completed_on = p_completed_on, due_date = p_next_due,
            last_evidence_id = null, updated_at = now()
        where service_user_id = p_record_id and definition_id = p_definition_id;
    end if;
  end if;
end;
$function$;

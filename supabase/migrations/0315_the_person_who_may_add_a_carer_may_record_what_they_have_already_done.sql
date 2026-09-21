-- 0315_the_person_who_may_add_a_carer_may_record_what_they_have_already_done
--
-- Phil, 2026-09-21: "in people we have add a person, this assumes that it is always a new
-- person, i want an option on the add a person page, tick it and all the column names are
-- visible with boxes for the required data to be added ... then when the add person button is
-- pressed, it adds them to the matrix with all the data just entered."
--
-- Somebody joining a company that already runs has a history: a DBS from two years ago, three
-- supervisions, a spot check last month. Until now Add a person could only make a new starter,
-- and that history had to be loaded by hand -- which is exactly what happened to Thistle's 86
-- spot checks (DEF-024).
--
-- seed_migrated_completion is what records a completion that happened before the product: it is
-- how the bulk import writes history. It asked for a Company Admin, which was right when only an
-- import used it. Add a person is open to Managers, Supervisors and Recruiters (0309, 0311), so
-- a Supervisor ticking the box would have filled the form in and been refused at the last step --
-- the same shape of defect as DEF-032, and this time we can see it coming.
--
-- is_branch_lead(branch) is the SAME question the People register already asks of the person
-- adding the record. Somebody who may create the carer, set their DBS date and complete their
-- checks is not made more powerful by being allowed to say when the last one happened.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.seed_migrated_completion(
  p_record_type text,
  p_record_id uuid,
  p_definition_id uuid,
  p_completed_on date,
  p_next_due date,
  p_is_latest boolean,
  p_due_on date default null::date,
  p_slot smallint default null::smallint
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  if not (
    public.is_platform_admin()
    or public.is_company_admin(v_company)
    or (v_branch is not null and public.is_branch_lead(v_branch))
  ) then
    raise exception 'not authorised';
  end if;

  insert into public.migrated_completions(
    company_id, branch_id, record_type, record_id, definition_id,
    completed_on, due_on, slot, created_by
  ) values (
    v_company, v_branch, p_record_type, p_record_id, p_definition_id,
    p_completed_on, p_due_on, p_slot, auth.uid()
  )
  on conflict (record_id, definition_id, completed_on)
    do update set due_on = coalesce(public.migrated_completions.due_on, excluded.due_on),
                  slot   = coalesce(public.migrated_completions.slot,   excluded.slot);

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
$$;

-- A MIGRATED REVIEW REMEMBERS WHICH SLOT IT WAS IN.
--
-- Phil, 2026-09-17: "for now i want a carbon copy of the data from monday into our columns,
-- when the reviews are done, our rules will take over."
--
-- WHY IT CANNOT BE WORKED OUT. The board runs four review slots as a fixed rotation,
-- R1 to R2 to R3 to R4 and back to R1, and which slot the cycle currently sits on depends on
-- where that board started years ago. Amanda Reynolds runs R2, R3, R4, R1 with R2 next.
-- Anne Bell runs R1, R2, R3, R4 with R1 next. Same interval, same shape, different phase, and
-- nothing in the dates says which. So it has to be carried, not derived.
--
-- ONE NUMBER IS ENOUGH: the slot of the most recent review. The rest follow by rotating
-- backwards, and the outstanding slot is the one after it. The import supplies that one
-- number and stamps a slot on every completion it writes.
--
-- NULL means a completion recorded in the product rather than imported, which has no board
-- slot and never needs one: once a review is completed here, our own cycle takes over.
--
-- The signature is replaced AND the previous one dropped, in this migration. Adding a
-- defaulted argument with CREATE OR REPLACE creates an overload, not a replacement, which on
-- 2026-09-16 made every call ambiguous and silently seeded nothing.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.migrated_completions
  add column if not exists slot smallint
    check (slot is null or slot between 1 and 8);

comment on column public.migrated_completions.slot is
  'The review slot this completion occupied on the system it was imported from. NULL for anything recorded in the product.';

create or replace function public.seed_migrated_completion(
  p_record_type text,
  p_record_id uuid,
  p_definition_id uuid,
  p_completed_on date,
  p_next_due date,
  p_is_latest boolean,
  p_due_on date default null,
  p_slot smallint default null
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
$function$;

drop function if exists public.seed_migrated_completion(text, uuid, uuid, date, date, boolean, date);

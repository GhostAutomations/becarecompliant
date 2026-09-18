-- 0301_an_incident_is_reported_investigated_and_answered
--
-- Phil, 2026-09-18: "build so our incidents is reported in a form, a case is opened and then
-- a investigation is required and then an outcome with recomendations, on investigation have
-- a no further action option, which means no outcome is required. build it like complaints so
-- we can use ai with the investigation and outcome."
--
-- WHY THIS, AND NOT MORE FIELDS ON THE RECORD. Thistle report incidents on a 123FormBuilder
-- form, not in here, for one reason: a carer cannot reach Incidents at all. The module opens
-- to Supervisor and above, and the team portal's "Report an incident" tile has been greyed out
-- since it was built. So the people who see incidents write them up somewhere else, and the
-- record in here is typed up afterwards by somebody who was not there.
--
-- The case now starts with a FORM that a carer can fill in, and the record is stamped from its
-- answers. After that it runs like a complaint: investigation, then outcome, with the same
-- Evidence pipeline and the same AI assist. This migration is the structure; the three forms
-- are 0302.
--
--   * evidence.record_type and forms.population learn 'incident' / 'incidents'. Complaints did
--     exactly this in 0063 when it became the second thing Evidence could be about.
--   * ref_number, with a per-company trigger and a backfill in logged order, so an incident can
--     be referred to in a notification the way a complaint can.
--   * investigation_completed, no_further_action, outcome_recorded_on, recommendations: the
--     stage stamps. no_further_action is the early exit Phil asked for -- an investigation that
--     finds nothing to do closes the case without an outcome.
--   * evidence_select gains a branch supervisor on incident evidence. Supervisors can already
--     see the incident; without this they could not read the report somebody else filed, which
--     makes investigating it impossible.
--   * incidents_insert admits any member of the company into a branch of their own company.
--     That is the carer reporting. Everything after reporting stays with the branch.
--   * incidents_select gains created_by, so whoever filed it can see the thing they just filed
--     rather than a confirmation they cannot check.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.evidence drop constraint if exists evidence_record_type_check;
alter table public.evidence add constraint evidence_record_type_check
  check (record_type = any (array['person','service_user','complaint','incident']));

alter table public.forms drop constraint if exists forms_population_check;
alter table public.forms add constraint forms_population_check
  check (population = any (array['people','service_users','complaints','incidents']));

alter table public.form_templates drop constraint if exists form_templates_population_check;
alter table public.form_templates add constraint form_templates_population_check
  check (population = any (array['people','service_users','complaints','incidents']));

alter table public.incidents
  add column if not exists ref_number integer,
  add column if not exists reported_on date,
  add column if not exists investigation_completed date,
  add column if not exists no_further_action boolean,
  add column if not exists outcome_recorded_on date,
  add column if not exists recommendations text;

update public.incidents set reported_on = coalesce(reported_on, created_at::date) where reported_on is null;

create or replace function public.incidents_assign_ref()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if new.ref_number is null then
    select coalesce(max(ref_number), 0) + 1 into new.ref_number
    from public.incidents where company_id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_assign_ref_trg on public.incidents;
create trigger incidents_assign_ref_trg before insert on public.incidents
  for each row execute function public.incidents_assign_ref();

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id) as n
  from public.incidents where ref_number is null
)
update public.incidents i set ref_number = numbered.n
from numbered where numbered.id = i.id;

create unique index if not exists incidents_company_ref_idx on public.incidents (company_id, ref_number);

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence for select to authenticated using (
  is_platform_admin()
  or is_company_admin(company_id)
  or (branch_id is not null and is_branch_manager(branch_id))
  or (author_id = auth.uid())
  or (record_type = 'complaint' and is_company_on_call(company_id))
  or (record_type = 'incident' and branch_id is not null and is_branch_supervisor(branch_id))
  or (record_type = 'person' and record_id is not null and (
        is_person_supervisor(record_id)
        or ((not is_staff()) and exists (
              select 1 from people pe where pe.id = evidence.record_id and pe.profile_id = auth.uid()))))
  or (record_type = 'service_user' and record_id is not null and is_service_user_supervisor(record_id))
);

drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents for insert to authenticated with check (
  is_platform_admin()
  or is_company_admin(company_id)
  or is_branch_manager(branch_id)
  or is_branch_supervisor(branch_id)
  or (is_company_member(company_id) and is_company_branch(company_id, branch_id))
);

drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select to authenticated using (
  is_platform_admin()
  or is_company_admin(company_id)
  or is_branch_manager(branch_id)
  or is_branch_supervisor(branch_id)
  or created_by = auth.uid()
);

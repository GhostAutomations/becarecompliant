-- 0341: a Senior cannot reopen the Evidence they filed on somebody else's record (Phil, 2026-09-29).
--
-- Found testing the Senior role: the Spot Check a Senior completed appeared under "Forms I have
-- sent in" on their own area, with View opening the whole completed form. Phil: that list is for
-- their own things (holiday requests and the like), "not on clients as in service users or
-- people". A Senior completes a Check and hands it in; reading it back is the office's job.
--
-- Evidence policy: the author's own-Evidence rule stays for everybody, EXCEPT a carer login
-- (is_staff(): Team Member and Senior) reading Evidence about a Service User, or about a Person
-- who is not themselves. Their own holiday, return to work, money and briefing forms are about
-- their own record (or no record) and stay theirs. The same change on evidence_files, so a file
-- on that Evidence cannot be fetched either. "Forms I have sent in" reads through this policy, so
-- the list and the View button follow it with no change in the app.

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select
  using (
    is_platform_admin()
    or is_company_admin(company_id)
    or ((branch_id is not null) and is_branch_lead(branch_id))
    or (
      author_id = auth.uid()
      and not (
        is_staff()
        and (
          record_type = 'service_user'
          or (
            record_type = 'person' and record_id is not null
            and not exists (select 1 from people pe where pe.id = evidence.record_id and pe.profile_id = auth.uid())
          )
        )
      )
    )
    or ((record_type = 'complaint') and is_company_on_call(company_id))
    or (
      (record_type = 'person') and (record_id is not null)
      and (
        is_person_supervisor(record_id)
        or ((not is_staff()) and exists (select 1 from people pe where pe.id = evidence.record_id and pe.profile_id = auth.uid()))
      )
    )
    or ((record_type = 'service_user') and (record_id is not null) and is_service_user_supervisor(record_id))
  );

drop policy if exists evidence_files_select on public.evidence_files;
create policy evidence_files_select on public.evidence_files
  for select
  using (
    exists (
      select 1 from evidence e
      where e.id = evidence_files.evidence_id
        and (
          is_platform_admin()
          or is_company_admin(e.company_id)
          or ((e.branch_id is not null) and is_branch_lead(e.branch_id))
          or (
            e.author_id = auth.uid()
            and not (
              is_staff()
              and (
                e.record_type = 'service_user'
                or (
                  e.record_type = 'person' and e.record_id is not null
                  and not exists (select 1 from people pe where pe.id = e.record_id and pe.profile_id = auth.uid())
                )
              )
            )
          )
          or (
            (e.record_type = 'person') and (e.record_id is not null)
            and (
              is_person_supervisor(e.record_id)
              or exists (select 1 from people pe where pe.id = e.record_id and pe.profile_id = auth.uid())
            )
          )
          or ((e.record_type = 'service_user') and (e.record_id is not null) and is_service_user_supervisor(e.record_id))
        )
    )
  );

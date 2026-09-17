-- 0289_seeing_a_carer_means_seeing_their_training
--
-- Phil, 2026-09-17: "Supervisors cant see training, anyone that can see people should see
-- training."
--
-- Training was gated in three places and all three had to agree: the nav entry's role list, the
-- page's own ALLOWED redirect, and this policy. A Supervisor failed the first two, and even past
-- them would have met an empty matrix, because person_training_select asks for a company wide
-- role or a BRANCH MANAGER and a Supervisor is neither. Three lists of roles to keep in step is
-- how a role ends up allowed in two of them and shown a blank page.
--
-- So the rule stops being a list and becomes the sentence Phil said: if you can see the carer,
-- you can see their training. The subquery reads `people` as the CALLER, so people_select decides
-- it — one policy, already correct, already carrying the Supervisor, the booked conductor and the
-- carer looking at their own record.
--
-- ADDITIVE. The existing select policies stay: policies are OR'd, and removing one to tidy up
-- would mean proving that every role it lets through is also let through by people_select, which
-- is a much bigger claim than this change needs to make.
--
-- What it does NOT widen: `staff`, the carer self service role, reaches people_select only through
-- `profile_id = auth.uid()`, so a carer still sees their own training and nobody else's.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists person_training_select_person_visible on public.person_training;

create policy person_training_select_person_visible
  on public.person_training
  for select
  using (
    exists (
      select 1 from public.people p
      where p.id = person_training.person_id
    )
  );

comment on policy person_training_select_person_visible on public.person_training is
  'Seeing a carer means seeing their training. The subquery is evaluated as the caller, so people_select is what decides, and the two cannot drift apart.';

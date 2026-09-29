-- 0337_undo_senior_as_a_company_role
-- Phil, 2026-09-29, straight after 0336: "I don't want senior to be an add-on role ... I want
-- senior to be a default role". Senior becomes a BUILT-IN role (its own profiles.role value,
-- listed in Role access), built in the migrations that follow. The custom company role that 0336
-- made is removed: no user or invite ever carried it (checked before this ran), and the seeding
-- function goes with it so no new company is given it.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

delete from public.company_roles r
where lower(btrim(r.name)) = 'senior'
  and r.base_role = 'supervisor'
  and not exists (select 1 from public.profiles p where p.company_role_id = r.id)
  and not exists (select 1 from public.invites i where i.company_role_id = r.id);

drop function if exists public.seed_company_default_roles(uuid);

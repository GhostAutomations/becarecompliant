-- Be Care Compliant: each AI policy draft records the nation it was written for (Phil,
-- 2026-10-06: policies for English companies must differ from Welsh ones, set by the regulator).
-- 'ciw' = Wales, 'cqc' = England. Applied 2026-10-06.
alter table public.policy_drafts add column if not exists nation text check (nation in ('ciw','cqc'));

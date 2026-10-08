-- 0426 (Phil, 2026-10-08)
-- 1. A fourth way to sign a policy: "both", a drawn signature AND the full name typed.
-- 2. Improve a policy with AI works for a policy that is not one of the standard policies,
--    checked against the core care rules, so its draft has no topic.

alter table public.policy_config
  drop constraint if exists policy_config_signature_mode_check;
alter table public.policy_config
  add constraint policy_config_signature_mode_check
  check (signature_mode in ('draw', 'type', 'either', 'both'));

alter table public.company_policies
  drop constraint if exists company_policies_signature_mode_check;
alter table public.company_policies
  add constraint company_policies_signature_mode_check
  check (signature_mode is null or signature_mode in ('draw', 'type', 'either', 'both'));

comment on column public.company_policies.signature_mode is
  'How this policy is signed: draw, type, either (their choice) or both (draw and type).';

alter table public.policy_drafts
  alter column topic_key drop not null;

comment on column public.policy_drafts.topic_key is
  'The standard policy it was written or checked for. Null when an improve review was a general check (not one of the standard policies).';

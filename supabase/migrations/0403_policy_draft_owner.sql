-- 0403: the policy owner, asked when writing a policy with AI (Phil, 2026-10-06), carried on the
-- draft and set on the policy when it is approved.
alter table public.policy_drafts add column if not exists owner_id uuid references public.profiles(id) on delete set null;

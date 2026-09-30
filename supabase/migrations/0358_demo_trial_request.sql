-- 0358 A DEMO CAN BELONG TO A TRIAL REQUEST (Phil, 2026-09-30: demos assigned to the people who
-- asked for a trial). Optional: a demo set up after a phone call has none.
alter table public.demos add column trial_request_id uuid references public.trial_requests(id) on delete set null;
create index demos_trial_request_idx on public.demos (trial_request_id) where trial_request_id is not null;

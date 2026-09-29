-- 0335_trial_request_billing_and_text
-- Phil, 2026-09-29: the trial form asks whether they would pay monthly or annually, and every
-- new trial request texts the founder as well as emailing him.
--
--   billing_interest   'monthly' | 'annual' | null (not sure). Shown in the founder alert, the
--                      Founder inbox copy and the Trial requests list.
--   founder_texted_at  when the text to the founder was accepted by Twilio.
--   founder_text_error why it was not sent (no mobile on the founder's profile, Twilio not
--                      configured, Twilio refused). A lead is the one thing on the platform that
--                      costs money when it is late, so whether he was told is a fact on the row,
--                      as founder_alerted_at already is for the email.
--
-- Additive and idempotent. Applied to the becarecompliant Supabase project ONLY
-- (bgrtcvyjuwopunpnudeu).

alter table public.trial_requests
  add column if not exists billing_interest text,
  add column if not exists founder_texted_at timestamptz,
  add column if not exists founder_text_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trial_requests_billing_interest_check'
  ) then
    alter table public.trial_requests
      add constraint trial_requests_billing_interest_check
      check (billing_interest is null or billing_interest in ('monthly', 'annual'));
  end if;
end $$;

-- 0172_spend_ai_credit_not_anon
--
-- THE LIST item 23. `spend_ai_credit` was executable by PUBLIC and by anon: a logged out
-- caller could reach a function that mutates a paying customer's balance.
--
-- It is safe TODAY only because of its own internal guard: it raises unless
-- is_company_member(cid), and an anonymous session is a member of nothing. That is one line
-- of defence, in one function, protecting the customer's money.
--
-- `spend_sms_credit` had EXACTLY this shape and was tightened when it was found. This is the
-- twin, and the same rule now applies: a function that spends money is reachable only by
-- somebody who is logged in. authenticated KEEPS execute, because spendAiCredit runs on the
-- caller's own RLS client (lib/billing/ai-credits.ts) and the guard inside is what scopes it
-- to their own company.
--
-- No behaviour changes for any real user. This closes a door nobody should have been at.

revoke all on function public.spend_ai_credit(uuid) from public;
revoke all on function public.spend_ai_credit(uuid) from anon;
grant execute on function public.spend_ai_credit(uuid) to authenticated;
grant execute on function public.spend_ai_credit(uuid) to service_role;

comment on function public.spend_ai_credit(uuid) is
  'Spends one AI credit for a company. Logged in callers only (item 23): anon and PUBLIC revoked 2026-08-11. The is_company_member guard inside scopes it to the caller''s own company.';

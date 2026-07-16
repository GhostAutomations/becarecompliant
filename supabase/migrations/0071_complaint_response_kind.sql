-- 0071_complaint_response_kind
-- Distinguish the two AI-drafted complaint communications: the initial response
-- (acknowledgement) and the full complaint response (drafted from the investigation).
-- Existing rows are acknowledgements. Applied to ref bgrtcvyjuwopunpnudeu only.

alter table public.complaint_responses
  add column if not exists kind text not null default 'initial'
    check (kind in ('initial', 'response'));

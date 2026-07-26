-- 0129_remove_holiday_response_form.sql
-- Approving or declining a holiday is a DECISION, not a form to fill in.
-- The Holiday Response form (inherited from the Monday board) made a Manager
-- complete a form to click yes or no, so it goes: from every company AND from
-- the founder template library, so no new company ever receives it again.
--
-- Safe: nothing references it. Any copy that somehow already holds Evidence is
-- archived instead of deleted, because Evidence is immutable and its form must
-- survive (evidence.form_id is ON DELETE RESTRICT).

update public.forms f
set status = 'archived'
where f.key = 'holiday_response'
  and exists (select 1 from public.evidence e where e.form_id = f.id);

delete from public.forms f
where f.key = 'holiday_response'
  and not exists (select 1 from public.evidence e where e.form_id = f.id);

delete from public.form_templates where key = 'holiday_response';

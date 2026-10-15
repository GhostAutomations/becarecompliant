-- 0483: the live signal (0418) for the tables behind Planner, policies, invoicing, whistleblowing,
-- inspections and record updates (Phil, 2026-10-15, popup "5 minutes").
--
-- The browser now remembers pages for five minutes and brings one up to date only when the
-- company's live channel says something changed (components/route-memory.tsx). These tables sent
-- no signal, so a change someone else made to them could have sat unseen on a remembered page.
-- Same triggers and function as 0418: one tiny {"table": ...} message per statement per company,
-- no personal data, and a Realtime problem can never fail a save. Nothing else changes.

do $$
declare
  t text;
begin
  foreach t in array array[
    'planner_bookings', 'planner_booking_tasks', 'company_policies', 'policy_drafts', 'invoices',
    'invoice_lines', 'invoice_schedules', 'invoice_schedule_lines', 'invoicing_config',
    'whistleblowing_disclosures', 'branch_inspections', 'inspection_notices',
    'readiness_self_ratings', 'record_updates', 'care_plan_entries', 'service_user_outcomes',
    'briefing_notices'
  ] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

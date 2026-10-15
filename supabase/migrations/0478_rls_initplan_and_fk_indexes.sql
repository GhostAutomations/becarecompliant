-- 0478: Speed plan, Push 1 (database quick wins). No change to who sees what.
--
-- 1. Policies: wrap every zero argument STABLE helper as a sub select, so Postgres works it out once
--    per query (an InitPlan) instead of once per row. The answer is the same: these functions take
--    no arguments and are STABLE, so within one statement they return the same value every time.
--    At the time of writing: is_platform_admin() unwrapped 249 times in 233 policies, auth.uid() 5,
--    is_staff() 5, my_company_id() 2, may_keep_letter_signature() 2. Already wrapped calls
--    ("( SELECT f() AS f)") are left exactly as they are, so running this twice changes nothing.
--    Only the USING and WITH CHECK expressions change; names, commands, roles and permissive or
--    restrictive stay as they were (ALTER POLICY keeps them).
--
-- 2. Indexes on the 21 foreign keys the performance advisor lists as unindexed (all small tables).
--
-- The RLS helpers themselves (is_platform_admin, is_company_admin, is_branch_*, my_* and the rest)
-- were already STABLE with search_path pinned, so they are not touched.
--
-- Proved before applying with the who-sees-what fingerprint (15 users across Thistle, Bevan and
-- Demo, every table and view, plus Readiness per branch): identical before and after.

do $wrap$
declare
  p record;
  f record;
  v_using text;
  v_check text;
  v_sql text;
  v_n integer := 0;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname, pol.qual, pol.with_check
      from pg_policies pol
     where pol.schemaname = 'public'
  loop
    v_using := p.qual;
    v_check := p.with_check;
    for f in
      select * from (values
        ('is_platform_admin()', 'is_platform_admin', 'is_platform_admin'),
        ('auth.uid()', 'auth\.uid', 'uid'),
        ('is_staff()', 'is_staff', 'is_staff'),
        ('my_company_id()', 'my_company_id', 'my_company_id'),
        ('may_keep_letter_signature()', 'may_keep_letter_signature', 'may_keep_letter_signature')
      ) as x(call, pattern, alias)
    loop
      -- Protect calls that are already wrapped, wrap the bare ones, then put the protected ones back.
      v_using := regexp_replace(v_using, '\(\s*SELECT\s+' || f.pattern || '\(\)\s+AS\s+' || f.alias || '\)', chr(1), 'g');
      v_using := regexp_replace(v_using, '(?<![A-Za-z0-9_.])' || f.pattern || '\(\)', '( SELECT ' || f.call || ' AS ' || f.alias || ')', 'g');
      v_using := replace(v_using, chr(1), '( SELECT ' || f.call || ' AS ' || f.alias || ')');
      v_check := regexp_replace(v_check, '\(\s*SELECT\s+' || f.pattern || '\(\)\s+AS\s+' || f.alias || '\)', chr(1), 'g');
      v_check := regexp_replace(v_check, '(?<![A-Za-z0-9_.])' || f.pattern || '\(\)', '( SELECT ' || f.call || ' AS ' || f.alias || ')', 'g');
      v_check := replace(v_check, chr(1), '( SELECT ' || f.call || ' AS ' || f.alias || ')');
    end loop;
    if v_using is distinct from p.qual or v_check is distinct from p.with_check then
      v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
      if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
      execute v_sql;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '0478: % policies rewritten', v_n;
end;
$wrap$;

create index if not exists holiday_requests_blackout_override_by_idx on public.holiday_requests (blackout_override_by);
create index if not exists support_tickets_raised_by_idx on public.support_tickets (raised_by);
create index if not exists support_ticket_messages_author_id_idx on public.support_ticket_messages (author_id);
create index if not exists support_ticket_messages_company_id_idx on public.support_ticket_messages (company_id);
create index if not exists user_signatures_company_id_idx on public.user_signatures (company_id);
create index if not exists person_office_periods_ended_by_idx on public.person_office_periods (ended_by);
create index if not exists person_office_periods_from_branch_id_idx on public.person_office_periods (from_branch_id);
create index if not exists person_office_periods_started_by_idx on public.person_office_periods (started_by);
create index if not exists goodwill_grants_created_by_idx on public.goodwill_grants (created_by);
create index if not exists goodwill_grants_stopped_by_idx on public.goodwill_grants (stopped_by);
create index if not exists notification_preferences_updated_by_idx on public.notification_preferences (updated_by);
create index if not exists user_notifications_actor_id_idx on public.user_notifications (actor_id);
create index if not exists user_notifications_branch_id_idx on public.user_notifications (branch_id);
create index if not exists user_notifications_check_instance_id_idx on public.user_notifications (check_instance_id);
create index if not exists user_notifications_definition_id_idx on public.user_notifications (definition_id);
create index if not exists user_notifications_person_id_idx on public.user_notifications (person_id);
create index if not exists user_notifications_service_user_id_idx on public.user_notifications (service_user_id);
create index if not exists morning_email_preferences_updated_by_idx on public.morning_email_preferences (updated_by);
create index if not exists holiday_blackouts_created_by_idx on public.holiday_blackouts (created_by);
create index if not exists holiday_blackouts_updated_by_idx on public.holiday_blackouts (updated_by);
create index if not exists holiday_blackout_branches_company_id_idx on public.holiday_blackout_branches (company_id);

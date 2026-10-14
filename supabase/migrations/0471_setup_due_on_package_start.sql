-- 0471: Setup is due ON the package start date, amber only on the day itself
-- (Phil, 2026-10-14; docs/decisions/setup-due-rule.md). All companies, current and future.
--
-- WAS: due one day before the package start (the Setup Visit's interval -1), amber from the
-- company's amber days (14 at all three companies).
-- NOW: the Setup Visit's interval is 0 (the package start itself) and its amber days 0, which
-- public.check_rag already reads as amber on the due day only, red after, green before. The due
-- date stays STORED on each setup check, so the dashboard, readiness, rollups, reports, the
-- morning email and the chasers all follow without any other change.
--
-- Phil, on Settings: "Change it so it is the setting for the same day, but leave it because other
-- companies might want to change it." So the Setup Visit's days and amber stay editable; 0 is the
-- new default and the new value everywhere.
--
-- 1. A one off check may be 0 days from its anchor (0031 allowed any interval but 0).
-- 2. The template new companies are seeded from.
-- 3. Every company's Setup Visit.
-- 4. Every setup check's stored due date moves to its package start (Phil OK'd the list,
--    2026-10-14). A done setup keeps its done date; only the date it is judged against moves.

-- 1.
alter table public.check_definitions drop constraint if exists check_definitions_interval_check;
alter table public.check_definitions
  add constraint check_definitions_interval_check
  check ("interval" is null or "interval" <> 0 or recurring = false);

-- 2.
update public.default_check_definitions
   set "interval" = 0,
       amber_days = 0,
       description = 'The visit where the office team collects everything needed to start care. Due on the day the package starts.'
 where population = 'service_users' and key = 'setup';

-- 3.
update public.check_definitions
   set "interval" = 0,
       amber_days = 0,
       description = case
         when description = 'The visit where the office team collects everything needed to start care. Due before the package starts.'
         then 'The visit where the office team collects everything needed to start care. Due on the day the package starts.'
         else description end,
       updated_at = now()
 where population = 'service_users' and key = 'setup' and recurring = false;

-- 4.
update public.check_instances ci
   set due_date = su.package_start_date, updated_at = now()
  from public.check_definitions cd, public.service_users su
 where cd.id = ci.definition_id
   and cd.population = 'service_users' and cd.key = 'setup'
   and su.id = ci.service_user_id
   and su.package_start_date is not null
   and ci.due_date is distinct from su.package_start_date;

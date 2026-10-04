-- Audit B3 and B4 (4 Oct 2026), plus D3.
--
-- B3. Three functions worked "today" out as current_date, which is UTC here, while the registers
-- and dashboard use Europe/London; between midnight and 1am in summer they disagreed.
--
-- B4 (Phil: count them everywhere). Readiness counted only active staff and Service Users, while
-- the People register counts anyone who has not left (maternity leave, long term sick). Service
-- Users in hospital or on respite were left out of the Service User register and rollup as well.
-- One rule now: a person counts until they leave, a Service User until their service ends.
--
-- Each function and view is rebuilt from its own current definition with only those words
-- changed, and the views keep security_invoker so RLS still applies to the reader.
do $$
declare
  f regprocedure;
  def text;
  v text;
begin
  foreach f in array array[
    'public.get_framework_check_readiness(uuid,text,uuid)'::regprocedure,
    'public.expire_evidence_retention(integer)'::regprocedure,
    'public.expire_record_update_retention(integer)'::regprocedure
  ] loop
    def := pg_get_functiondef(f);
    def := replace(def, 'current_date', '((now() at time zone ''Europe/London'')::date)');
    def := replace(def, 'pe.employment_status = ''active''', 'pe.employment_status <> ''leaver''');
    def := replace(def, 'su.service_status = ''active''', 'su.service_status <> ''cancelled''');
    execute def;
  end loop;

  foreach v in array array['service_user_check_status', 'service_user_rollup'] loop
    def := pg_get_viewdef(('public.' || v)::regclass, true);
    def := replace(def, 'service_status = ''active''::text', 'service_status <> ''cancelled''::text');
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v, def);
  end loop;
end;
$$;

-- D3 (Phil: no preference, so the recommended choice). Two logins belonging to no company could
-- sign in to an empty account. Disabled, not deleted, so either can be invited again.
update public.profiles
   set status = 'disabled'
 where company_id is null
   and status = 'active'
   and email in ('ppdavies+bcctest@gmail.com', 'quadridamilola31@gmail.com');

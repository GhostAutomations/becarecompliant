-- Audit W2 (4 Oct 2026): archived people were still listed on the Absence page with stages and
-- "Book meeting", because person_absence_summary filtered on employment status only. It now
-- leaves archived records out, as the registers do. Its rolling window also used CURRENT_DATE
-- (UTC here); it uses the London date like the rest (audit B3). Rebuilt from its own current
-- definition, keeping security_invoker so RLS still applies to the reader.
do $$
declare
  def text;
begin
  def := pg_get_viewdef('public.person_absence_summary'::regclass, true);
  def := replace(def, 'CURRENT_DATE', '((now() at time zone ''Europe/London'')::date)');
  def := replace(def, 'WHERE pe.employment_status = ''active''::text',
                      'WHERE pe.employment_status = ''active''::text AND pe.archived_at IS NULL');
  if position('pe.archived_at IS NULL' in def) = 0 then
    raise exception 'person_absence_summary did not have the expected shape; nothing changed';
  end if;
  execute 'create or replace view public.person_absence_summary with (security_invoker = on) as ' || def;
end;
$$;

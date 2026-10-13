-- 0452: every Handover change in the audit log (audit F171, the Handover half; Phil, 2026-10-13,
-- popup "Do it now").
--
-- Only adding a Handover was logged. Edits, finalising, closing or reopening a follow up and
-- removing one wrote nothing. A trigger now logs each of them, however the row is written: who,
-- when, which shift, which fields changed, and the row before and after.
--
-- THE NOTES ARE NOT COPIED (Phil, popup "Notes: changed only"). The free text fields can hold
-- health details about service users; copying them into the audit log would keep them outside the
-- Handover's own retention and deletion. For those fields the entry records that they changed,
-- never the words. Everything else (counts, yes/no, urgent, finalised, follow up done, shift,
-- branch) is kept before and after.
--
-- Safe to run twice.

create or replace function public.audit_on_call_log()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r public.on_call_logs;
  -- Free text: recorded as changed, never copied.
  v_text constant text[] := array['details', 'follow_up_notes', 'follow_up_action', 'action_taken',
                                  'outcome', 'caller_name', 'caller_relationship', 'handler_name', 'category'];
  v_noise constant text[] := array['updated_at', 'updated_by'];
  v_actor uuid := auth.uid();
  v_email text;
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_label text;
  v_action text;
  v_summary text;
  k text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into v_changed
      from jsonb_each(to_jsonb(new)) n
     where not (n.key = any (v_noise))
       and n.value is distinct from (to_jsonb(old) -> n.key);
    if cardinality(v_changed) = 0 then
      return null; -- a save that changed nothing is not a change
    end if;
  end if;

  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  foreach k in array v_text || v_noise loop
    v_old := v_old - k;
    v_new := v_new - k;
  end loop;

  if v_actor is not null then
    select p.email, p.role into v_email, v_role from public.profiles p where p.id = v_actor;
  end if;

  v_label := 'Handover ' || coalesce(upper(r.slot) || ' ', '')
          || coalesce(to_char(r.shift_date, 'DD/MM/YYYY'), 'ref ' || r.ref_number::text)
          || ', ' || coalesce((select b.name from public.branches b where b.id = r.branch_id), 'whole company');

  if tg_op = 'INSERT' then
    v_action := 'on_call.call_logged';
    v_summary := v_label || ' added';
  elsif tg_op = 'DELETE' then
    v_action := 'on_call.handover_removed';
    v_summary := v_label || ' removed';
  elsif 'finalised' = any (v_changed) and new.finalised then
    v_action := 'on_call.handover_finalised';
    v_summary := v_label || ' finalised';
  elsif 'follow_up_done' = any (v_changed) and new.follow_up_done then
    v_action := 'on_call.handover_follow_up_closed';
    v_summary := v_label || ': urgent follow up marked done';
  elsif 'follow_up_done' = any (v_changed) then
    v_action := 'on_call.handover_follow_up_reopened';
    v_summary := v_label || ': urgent follow up reopened';
  else
    v_action := 'on_call.handover_edited';
    v_summary := v_label || ' edited';
  end if;

  insert into public.audit_log (company_id, actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata)
  values (
    r.company_id, v_actor, v_email, coalesce(v_role, case when v_actor is null then 'system' end),
    v_action, 'on_call_log', r.id::text, v_summary,
    jsonb_build_object('ref_number', r.ref_number, 'changed', to_jsonb(v_changed),
                       'before', v_old, 'after', v_new)
  );
  return null;
end;
$function$;

revoke execute on function public.audit_on_call_log() from public, anon, authenticated;

drop trigger if exists audit_on_call_log on public.on_call_logs;
create trigger audit_on_call_log
  after insert or update or delete on public.on_call_logs
  for each row execute function public.audit_on_call_log();

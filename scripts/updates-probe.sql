-- scripts/updates-probe.sql — who can read, post, edit, pin and remove record Updates (0324).
-- Runs entirely inside one DO block that ends by raising its own report, so NOTHING survives:
-- the fixtures, the role swaps and every update written are rolled back with it. Bevan Care Ltd.
do $probe$
declare
  c_company constant uuid := '84172279-54e4-4d5b-94b4-c92dc05c6baa';
  c_swansea constant uuid := '8deb438e-98dd-4426-b6e7-fc1e6e19fc7b';
  c_admin constant uuid := 'ca13390c-ed11-49e8-b5f8-025036859b42';
  c_sup constant uuid := '9b7d6cae-a1ac-411e-9a6e-c041877de5cd';
  v_other_branch uuid;
  v_person uuid := gen_random_uuid();
  v_own uuid := gen_random_uuid();
  v_far uuid := gen_random_uuid();
  v_su uuid := gen_random_uuid();
  v_admin_update uuid := gen_random_uuid();
  v_report text := '';
  v_role text;
  v_expect text;
  v_got text;
  v_ok boolean;
  v_n int;
  v_id uuid;
  v_fails int := 0;
begin
  select id into v_other_branch from branches where company_id = c_company and id <> c_swansea order by kind limit 1;
  insert into people (id, company_id, branch_id, full_name) values
    (v_person, c_company, c_swansea, 'ZZ PROBE Person'),
    (v_own, c_company, c_swansea, 'ZZ PROBE Own'),
    (v_far, c_company, v_other_branch, 'ZZ PROBE Far');
  update people set profile_id = c_sup where id = v_own;
  insert into service_users (id, company_id, branch_id, full_name) values (v_su, c_company, c_swansea, 'ZZ PROBE SU');
  insert into record_updates (id, company_id, person_id, author_id, author_name, body)
    values (v_admin_update, c_company, v_person, c_admin, 'Bev Admin', 'Admin wrote this');

  foreach v_role in array array['company_admin','registered_manager','manager','supervisor','recruiter','team_member','on_call','staff'] loop
    -- As ourselves again (no user on the request), or the profile guard refuses the swap.
    perform set_config('request.jwt.claims', '', true);
    update profiles set role = v_role where id = c_sup;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', c_sup, 'role', 'authenticated')::text, true);

    v_got := '';
    -- read: Swansea person, own record, other branch, service user, the admin's row via RLS
    v_got := v_got || (case when can_read_record_updates(v_person, null) then 'R' else '-' end);
    v_got := v_got || (case when can_read_record_updates(v_own, null) then 'O' else '-' end);
    v_got := v_got || (case when can_read_record_updates(v_far, null) then 'F' else '-' end);
    v_got := v_got || (case when can_read_record_updates(null, v_su) then 'S' else '-' end);
    select count(*) into v_n from record_updates where id = v_admin_update;
    v_got := v_got || (case when v_n = 1 then 'V' else '-' end);
    -- post on the person, post on the service user
    begin
      v_id := post_record_update(gen_random_uuid(), v_person, null, null, 'probe', null, '[]');
      v_got := v_got || 'P';
    exception when others then v_got := v_got || '-'; end;
    begin
      v_id := post_record_update(gen_random_uuid(), null, v_su, null, 'probe', null, '[]');
      v_got := v_got || 'Q';
    exception when others then v_got := v_got || '-'; end;
    -- reply to the admin's update
    begin
      v_id := post_record_update(gen_random_uuid(), v_person, null, v_admin_update, 'reply', null, '[]');
      v_got := v_got || 'Y';
    exception when others then v_got := v_got || '-'; end;
    -- edit somebody else's (always refused)
    begin
      perform edit_record_update(v_admin_update, 'changed');
      v_got := v_got || 'E!';
    exception when others then v_got := v_got || '-'; end;
    -- pin
    begin
      perform pin_record_update(v_admin_update, true);
      v_got := v_got || 'N';
    exception when others then v_got := v_got || '-'; end;
    -- remove (Company Admin only)
    begin
      perform remove_record_update(v_admin_update, 'probe reason');
      v_got := v_got || 'X';
    exception when others then v_got := v_got || '-'; end;
    -- the edits history (Admin only)
    select count(*) into v_n from record_update_edits where update_id = v_admin_update;
    v_got := v_got || (case when v_n > 0 then 'H' else '-' end);
    -- @ list
    select count(*) into v_n from record_update_mentionables(v_person, null);
    v_got := v_got || (case when v_n > 0 then 'M' else '-' end);

    execute 'set local role none';
    -- put the admin's update back as it was for the next role
    update record_updates set body = 'Admin wrote this', removed_at = null, removed_by = null, removed_reason = null,
      pinned_at = null, pinned_by = null, edited_at = null where id = v_admin_update;
    delete from record_update_edits where update_id = v_admin_update;

    -- R O F S V P Q Y (edit) N X H M
    v_expect := case v_role
      when 'company_admin'      then 'ROFSVPQY-NXHM'
      when 'registered_manager' then 'ROFSVPQY-N--M'
      when 'manager'            then 'R--SVPQY-N--M'
      when 'supervisor'         then 'R--SVPQY-N--M'
      when 'recruiter'          then 'R-FSVPQY-N--M'
      when 'team_member'        then 'R--SV--------'
      else '-------------' end;
    v_ok := v_got = v_expect;
    if not v_ok then v_fails := v_fails + 1; end if;
    v_report := v_report || format(E'\n%s %-18s got %s expected %s', case when v_ok then 'PASS' else 'FAIL' end, v_role, v_got, v_expect);
  end loop;

  -- The edit that IS allowed: the author on their own words, keeping the old ones.
  perform set_config('request.jwt.claims', '', true);
  update profiles set role = 'supervisor' where id = c_sup;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c_sup, 'role', 'authenticated')::text, true);
  v_id := post_record_update(gen_random_uuid(), v_person, null, null, 'first words', array[c_admin, c_sup], '[]');
  perform edit_record_update(v_id, 'second words');
  -- idempotent: the same id again returns it, no second row
  perform post_record_update(v_id, v_person, null, null, 'first words', null, '[]');
  execute 'set local role none';
  select count(*) into v_n from record_update_edits where update_id = v_id and previous_body = 'first words';
  v_report := v_report || format(E'\n%s author edits own, old wording kept', case when v_n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from record_updates where id = v_id;
  v_report := v_report || format(E'\n%s posting twice makes one update', case when v_n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from record_update_mentions where update_id = v_id;
  v_report := v_report || format(E'\n%s @mention keeps the Admin, drops yourself (%s)', case when v_n = 1 then 'PASS' else 'FAIL' end, v_n);

  -- A file path from another update is refused.
  execute 'set local role authenticated';
  begin
    perform post_record_update(gen_random_uuid(), v_person, null, null, '', null,
      jsonb_build_array(jsonb_build_object('storage_path', c_company::text || '/' || gen_random_uuid()::text || '/1-a.pdf', 'file_name', 'a.pdf', 'mime_type', 'application/pdf', 'bytes', 10, 'sha256', 'x')));
    v_report := v_report || E'\nFAIL a file from another update was accepted';
  exception when others then v_report := v_report || E'\nPASS a file from another update is refused';
  end;
  -- Empty is refused.
  begin
    perform post_record_update(gen_random_uuid(), v_person, null, null, '   ', null, '[]');
    v_report := v_report || E'\nFAIL an empty update was accepted';
  exception when others then v_report := v_report || E'\nPASS an empty update is refused';
  end;
  -- A reply to a reply is refused.
  begin
    perform post_record_update(gen_random_uuid(), v_person, null, v_admin_update, 'r1', null, '[]');
    select id into v_id from record_updates where parent_id = v_admin_update limit 1;
    perform post_record_update(gen_random_uuid(), v_person, null, v_id, 'r2', null, '[]');
    v_report := v_report || E'\nFAIL a reply to a reply was accepted';
  exception when others then v_report := v_report || E'\nPASS a reply to a reply is refused';
  end;
  execute 'set local role none';

  -- A deleted record's files are queued for removal.
  insert into record_update_files (company_id, update_id, storage_path, file_name, mime_type, bytes, sha256)
    values (c_company, v_admin_update, c_company::text || '/' || v_admin_update::text || '/1-probe.pdf', 'probe.pdf', 'application/pdf', 10, 'x');
  delete from people where id = v_person;
  select count(*) into v_n from record_update_file_trash where storage_path = c_company::text || '/' || v_admin_update::text || '/1-probe.pdf';
  v_report := v_report || format(E'\n%s deleting a record queues its files for removal', case when v_n = 1 then 'PASS' else 'FAIL' end);

  raise exception using errcode = 'P0001', message = '__probe_report__' || v_report;
end;
$probe$;

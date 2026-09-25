-- Rolled back probe for migration 0331 (Return to Work questions by text). Runs on Bevan Care
-- Ltd test people and raises __probe_report__ at the end so nothing is kept. See
-- TEST-CHECKLIST-RTW-TEXT.md for the expected answers (all passed 2026-09-25).
do $$
declare
  r text := '';
  v_id uuid;
  n int;
  j jsonb;
  s text;
  admin uuid := 'ca13390c-ed11-49e8-b5f8-025036859b42';
  sup uuid := '9b7d6cae-a1ac-411e-9a6e-c041877de5cd';
  emp uuid := '80058fad-48b5-413f-b849-c30e22bf857d';
  other uuid := '18ce07b9-cf5e-4b6f-9e5b-25e4b72ce2b9';
  ev uuid := '9b9ff0c6-d5cd-48ec-9e0c-6319a63767f0';
  person uuid := '38a8e042-f13a-4749-a62e-e5140eb8c5bb';
  qs jsonb := '[{"question":"Are you fit?","type":"yes_no"},{"question":"Anything else?","type":"text"},{"question":"Pick","type":"choice","options":["A","B"]}]';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into rtw_questionnaires (company_id, absence_event_id, person_id, branch_id, questions, drafted_by)
  values ('84172279-54e4-4d5b-94b4-c92dc05c6baa', ev, person, '8deb438e-98dd-4426-b6e7-fc1e6e19fc7b', qs, admin) returning id into v_id;
  r := r || '1 admin insert ok; ';
  select count(*) into n from rtw_questionnaires where id = v_id; r := r || '2 admin sees ' || n || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  select count(*) into n from rtw_questionnaires where id = v_id; r := r || '3 employee direct select ' || n || '; ';
  j := my_rtw_questions(v_id); r := r || '3b employee reads drafted: ' || coalesce(j::text,'null') || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true);
  update rtw_questionnaires set status='sent', sent_at=now(), expires_at=now()+interval '7 days' where id=v_id;
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  j := my_rtw_questions(v_id); r := r || '5 employee reads sent: ' || (j->>'status') || ' q=' || jsonb_array_length(j->'questions') || ' hasSummary=' || (j ? 'summary')::text || '; ';
  select count(*) into n from my_open_rtw_questions(); r := r || '5b open ' || n || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role','authenticated')::text, true);
  j := my_rtw_questions(v_id); r := r || '6 other employee reads: ' || coalesce(j::text,'null') || '; ';
  begin s := submit_my_rtw_answers(v_id, '["Yes","x","A"]'); r := r || '6b other submit WRONGLY ok; ';
  exception when others then r := r || '6b other submit refused: ' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  begin s := submit_my_rtw_answers(v_id, '["Yes","x"]'); r := r || '7a short WRONGLY ok; ';
  exception when others then r := r || '7a short: ' || sqlerrm || '; '; end;
  begin s := submit_my_rtw_answers(v_id, '["Yes","  ","A"]'); r := r || '7b blank WRONGLY ok; ';
  exception when others then r := r || '7b blank: ' || sqlerrm || '; '; end;
  begin s := submit_my_rtw_answers(v_id, '["Maybe","x","A"]'); r := r || '7c yesno WRONGLY ok; ';
  exception when others then r := r || '7c yesno: ' || sqlerrm || '; '; end;
  begin s := submit_my_rtw_answers(v_id, '["Yes","x","C"]'); r := r || '7d choice WRONGLY ok; ';
  exception when others then r := r || '7d choice: ' || sqlerrm || '; '; end;
  s := submit_my_rtw_answers(v_id, '["Yes"," Feeling better ","B"]'); r := r || '7e valid: ' || s || '; ';
  s := submit_my_rtw_answers(v_id, '["No","again","A"]'); r := r || '7f again: ' || s || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role','authenticated')::text, true);
  select answers::text || ' ' || status into s from rtw_questionnaires where id = v_id; r := r || '8 supervisor sees: ' || coalesce(s,'NOTHING') || '; ';
  begin delete from rtw_questionnaires where id = v_id; get diagnostics n = row_count; r := r || '9 delete rows ' || n || '; ';
  exception when others then r := r || '9 delete refused: ' || sqlerrm || '; '; end;
  set local role anon;
  begin j := my_rtw_questions(v_id); r := r || '10 anon WRONGLY called; ';
  exception when others then r := r || '10 anon: ' || sqlerrm || '; '; end;
  raise exception '__probe_report__ %', r;
end $$;

-- scripts/on-call-rota-probe.sql
--
-- Who may do what on the On Call rota and the Handover, tried for real as every role, then thrown
-- away (Phil, 2026-10-13: "Check each role before and after and show me").
--
-- HOW IT WORKS. One person (v_probe, a Bevan test login in Swansea) is given each role in turn, as
-- postgres, and then the attempts run as that person through RLS. Fixture rows (a Swansea shift, a
-- Neath shift, a company-wide shift, and a Handover entry of each kind) are made first. Every
-- attempt is undone inside its own block, and the whole run ends with an exception, so nothing it
-- did survives, the role swaps included. Safe to run against live; Bevan only.
--
-- HOW TO READ IT. One line per role: R = can read, A = can add, C = can change, X = can remove,
-- for a shift in the person's own branch (own), another branch (other) and the company-wide rota
-- (co); then the Handover: R/A/C for own branch, other branch, company-wide. After 0450 the run is
-- repeated with the Settings switch "On Call: can set the rota" off for Supervisor and Recruiter,
-- and ends with the audit entries a Supervisor's add, change and remove leave behind.

do $$
declare
  v_company constant uuid := '84172279-54e4-4d5b-94b4-c92dc05c6baa'; -- Bevan Care Ltd (test)
  v_probe   constant uuid := '9b7d6cae-a1ac-411e-9a6e-c041877de5cd'; -- ZZ Test Supervisor, Swansea
  v_own     constant uuid := '8deb438e-98dd-4426-b6e7-fc1e6e19fc7b'; -- Swansea
  v_other   constant uuid := 'ad688b03-01ea-4b83-8b79-8724deb7b0b7'; -- Neath
  v_roles   text[] := array['company_admin','registered_individual','registered_manager','manager',
                            'supervisor','recruiter','on_call','senior','team_member','staff'];
  v_role text;
  v_switch text;
  v_audit text;
  v_out text := '';
  v_line text;
  s_own uuid; s_other uuid; s_co uuid;
  l_own uuid; l_other uuid; l_co uuid;
  n int;
  k text;
  b uuid;
  tgt uuid;
  ok boolean;
begin
  -- Fixtures, as postgres.
  insert into on_call_shifts(company_id, branch_id, starts_at, ends_at, shift_date, slot, on_call_name)
    values (v_company, v_own, '2030-01-07T00:00:00Z', '2030-01-07T12:00:00Z', '2030-01-07', 'am', 'ZZ PROBE')
    returning id into s_own;
  insert into on_call_shifts(company_id, branch_id, starts_at, ends_at, shift_date, slot, on_call_name)
    values (v_company, v_other, '2030-01-07T00:00:00Z', '2030-01-07T12:00:00Z', '2030-01-07', 'am', 'ZZ PROBE')
    returning id into s_other;
  insert into on_call_shifts(company_id, branch_id, starts_at, ends_at, shift_date, slot, on_call_name)
    values (v_company, null, '2030-01-07T00:00:00Z', '2030-01-07T12:00:00Z', '2030-01-07', 'am', 'ZZ PROBE')
    returning id into s_co;
  insert into on_call_logs(company_id, branch_id, ref_number, details) values (v_company, v_own, 990001, 'ZZ PROBE') returning id into l_own;
  insert into on_call_logs(company_id, branch_id, ref_number, details) values (v_company, v_other, 990002, 'ZZ PROBE') returning id into l_other;
  insert into on_call_logs(company_id, branch_id, ref_number, details) values (v_company, null, 990003, 'ZZ PROBE') returning id into l_co;

  foreach v_switch in array array['switch on', 'switch off'] loop
  if v_switch = 'switch off' then
    if exists (select 1 from information_schema.columns where table_name = 'companies' and column_name = 'on_call_rota_roles') then
      execute 'update companies set on_call_rota_roles = ''{}'' where id = $1' using v_company;
    else
      exit;
    end if;
  end if;
  v_out := v_out || '-- ' || v_switch || E'\n';
  foreach v_role in array v_roles loop
    update profiles set role = v_role, status = 'active' where id = v_probe;
    perform set_config('request.jwt.claims', json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_line := rpad(v_role, 22);

    -- Rota
    foreach k in array array['own','other','co'] loop
      b := case k when 'own' then v_own when 'other' then v_other else null end;
      tgt := case k when 'own' then s_own when 'other' then s_other else s_co end;
      v_line := v_line || ' ' || k || ':';
      select count(*) into n from on_call_shifts where id = tgt;
      v_line := v_line || case when n > 0 then 'R' else '-' end;
      ok := false;
      begin
        insert into on_call_shifts(company_id, branch_id, starts_at, ends_at, shift_date, slot, on_call_name)
          values (v_company, b, '2030-01-08T00:00:00Z', '2030-01-08T12:00:00Z', '2030-01-08', 'am', 'ZZ PROBE');
        raise exception 'PROBE_OK';
      exception when others then ok := (sqlerrm = 'PROBE_OK');
      end;
      v_line := v_line || case when ok then 'A' else '-' end;
      ok := false;
      begin
        update on_call_shifts set phone = '0' where id = tgt;
        get diagnostics n = row_count;
        if n > 0 then raise exception 'PROBE_OK'; end if;
      exception when others then ok := (sqlerrm = 'PROBE_OK');
      end;
      v_line := v_line || case when ok then 'C' else '-' end;
      ok := false;
      begin
        delete from on_call_shifts where id = tgt;
        get diagnostics n = row_count;
        if n > 0 then raise exception 'PROBE_OK'; end if;
      exception when others then ok := (sqlerrm = 'PROBE_OK');
      end;
      v_line := v_line || case when ok then 'X' else '-' end;
    end loop;

    -- Handover
    v_line := v_line || '  | Handover';
    foreach k in array array['own','other','co'] loop
      b := case k when 'own' then v_own when 'other' then v_other else null end;
      tgt := case k when 'own' then l_own when 'other' then l_other else l_co end;
      v_line := v_line || ' ' || k || ':';
      select count(*) into n from on_call_logs where id = tgt;
      v_line := v_line || case when n > 0 then 'R' else '-' end;
      ok := false;
      begin
        insert into on_call_logs(company_id, branch_id, ref_number, details) values (v_company, b, 990099, 'ZZ PROBE');
        raise exception 'PROBE_OK';
      exception when others then ok := (sqlerrm = 'PROBE_OK');
      end;
      v_line := v_line || case when ok then 'A' else '-' end;
      ok := false;
      begin
        update on_call_logs set outcome = 'x' where id = tgt;
        get diagnostics n = row_count;
        if n > 0 then raise exception 'PROBE_OK'; end if;
      exception when others then ok := (sqlerrm = 'PROBE_OK');
      end;
      v_line := v_line || case when ok then 'C' else '-' end;
    end loop;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    v_out := v_out || v_line || E'\n';
  end loop;
  end loop;

  -- The audit trail of a Supervisor's add, change and remove (kept until the final rollback).
  if exists (select 1 from information_schema.columns where table_name = 'companies' and column_name = 'on_call_rota_roles') then
    update companies set on_call_rota_roles = array['supervisor','recruiter'] where id = v_company;
    update profiles set role = 'supervisor', status = 'active' where id = v_probe;
    perform set_config('request.jwt.claims', json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into on_call_shifts(company_id, branch_id, starts_at, ends_at, shift_date, slot, on_call_profile_id)
      values (v_company, null, '2030-02-04T12:00:00Z', '2030-02-05T00:00:00Z', '2030-02-04', 'pm', v_probe)
      returning id into tgt;
    update on_call_shifts set on_call_profile_id = null, on_call_name = 'ZZ PROBE Other' where id = tgt;
    update on_call_shifts set phone = phone where id = tgt; -- no change: must not be logged
    delete from on_call_shifts where id = tgt;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    select string_agg(action || ' by ' || coalesce(actor_role, '?') || ': ' || summary
                      || ' [before ' || coalesce(metadata->'before'->>'on_call_name', metadata->'before'->>'on_call_profile_id', '-')
                      || ', after ' || coalesce(metadata->'after'->>'on_call_name', metadata->'after'->>'on_call_profile_id', '-') || ']',
                      E'\n' order by created_at, action)
      into v_audit from audit_log where entity_id = tgt::text;
    v_out := v_out || E'-- audit\n' || coalesce(v_audit, 'NO AUDIT ROWS') || E'\n';
  end if;

  raise exception E'PROBE RESULT (all rolled back)\n%', v_out;
end $$;

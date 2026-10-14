-- 0469: the Lead the Leader form says "Lead the Leader meeting", not "supervision"
-- (Phil, 2026-10-14, after ticking the Office matrix: "when I click in it says supervision, is it
-- still showing the supervision form or is it now the lead the leader form"; popup: "Yes, that
-- wording"; docs/decisions/office-matrix.md).
--
-- WHAT CHANGES. Eight pieces of wording in the Lead the Leader form, matched as exact whole strings,
-- so no key, field, scoring or other text moves. "This is the part a carer's supervision does not
-- have" stays: it really is about a carer's supervision. Field keys (supervision_date and so on)
-- are unchanged, so the completion date and every report read the form exactly as before.
--
-- A NEW VERSION WHERE IT HAS BEEN USED (as 0455). A company whose current version already has
-- Evidence gets the next version, and the completed forms keep the wording they were filled in
-- with. One never used is updated in place. The library template, which seeds new companies, goes
-- up a version. Every company, Thistle included (Phil's popup).
--
-- Safe to run twice: wording already changed is left alone.

create or replace function pg_temp.ltl_wording(s jsonb) returns jsonb
language plpgsql immutable as $$
declare
  t text := s::text;
  pairs text[][] := array[
    ['The supervision', 'The Lead the Leader meeting'],
    ['Date of supervision', 'Date of Lead the Leader meeting'],
    ['Next supervision planned for', 'Next Lead the Leader meeting planned for'],
    ['Since the last supervision', 'Since the last Lead the Leader meeting'],
    ['Actions agreed at the last supervision', 'Actions agreed at the last Lead the Leader meeting'],
    ['Examples of good practice or achievements since the last supervision',
     'Examples of good practice or achievements since the last Lead the Leader meeting'],
    ['Training completed since the last supervision', 'Training completed since the last Lead the Leader meeting'],
    ['I confirm that this is an accurate and true record of the supervision.',
     'I confirm that this is an accurate and true record of the Lead the Leader meeting.']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    -- Whole JSON string values only: the quotes on both sides.
    t := replace(t, to_jsonb(pairs[i][1])::text, to_jsonb(pairs[i][2])::text);
  end loop;
  return t::jsonb;
end;
$$;

-- 1. The library template (new companies are seeded from it).
update public.form_templates
   set schema = pg_temp.ltl_wording(schema),
       version = version + 1,
       updated_at = now()
 where key = 'lead_the_leader'
   and schema is distinct from pg_temp.ltl_wording(schema);

-- 2. Every company's Lead the Leader form.
do $$
declare
  r record;
  v_schema jsonb;
  v_new jsonb;
  v_used boolean;
  v_version integer;
  v_lib integer;
begin
  select version into v_lib from public.form_templates where key = 'lead_the_leader';
  for r in
    select f.id, f.company_id, f.current_version
      from public.forms f
     where f.key = 'lead_the_leader'
  loop
    select schema into v_schema from public.form_versions
     where form_id = r.id and version = r.current_version;
    if v_schema is null then continue; end if;
    v_new := pg_temp.ltl_wording(v_schema);
    if v_new = v_schema then continue; end if;
    select exists (
      select 1 from public.evidence e
      join public.form_versions fv on fv.id = e.form_version_id
      where fv.form_id = r.id and fv.version = r.current_version
    ) into v_used;

    if v_used then
      select coalesce(max(version), 0) + 1 into v_version from public.form_versions where form_id = r.id;
      insert into public.form_versions (form_id, version, schema, status)
      values (r.id, v_version, v_new, 'published');
    else
      v_version := r.current_version;
      update public.form_versions set schema = v_new where form_id = r.id and version = v_version;
    end if;

    update public.forms
       set current_version = v_version,
           library_version = coalesce(v_lib, library_version),
           library_schema = pg_temp.ltl_wording(coalesce(library_schema, v_schema)),
           updated_at = now()
     where id = r.id;

    perform public.rebake_form_field_options(r.company_id);
  end loop;
end $$;

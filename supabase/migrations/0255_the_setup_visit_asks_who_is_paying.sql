-- 0255_the_setup_visit_asks_who_is_paying
-- Phil, 2026-09-09, reviewing the Service User forms: on the Setup Visit, "under the
-- completed by add a question, is the care package Local Authority, NHS or Private", and
-- "remove Consent obtained, Risk assessments in place".
--
-- DEFAULT FOR ALL COMPANIES. The founder template and every company's copy are rewritten
-- together, so a company created tomorrow gets the same Setup Visit as Thistle.
--
-- WHY WHO PAYS BELONGS HERE. It is settled at the setup visit and it changes almost
-- everything downstream: who the invoice goes to, which monitoring return the package appears
-- in, and which authority asks to see the records. Asking it later means asking the office to
-- remember.
--
-- WHY THE OTHER TWO GO. "Risk assessments in place" and "Consent obtained" were a yes/no tick
-- against work that has its own home: consent and capacity, and the risk assessments, are part
-- of the Individual Plan Review. A tick box that says risk assessments exist is not evidence
-- that they do, and two places recording the same fact is how they end up disagreeing.
-- Care plan in place stays, because the setup visit is where the care plan is actually put in.
--
-- The order asked for: Date, Completed by, WHO PAYS, Care plan in place, Notes, Signature.
--
-- V1 IS EDITED IN PLACE, which is the standing rule while the defaults are being built
-- (Phil, 2026-09-08: "while we are building the defaults all forms will always be v1"). That
-- is only safe while nothing has been completed on this form, so the guard below refuses if
-- any Evidence exists. Once Thistle's real service users are loaded this becomes a new
-- version instead.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  new_schema jsonb := $json$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "setup",
      "title": "Care setup",
      "fields": [
        { "key": "setup_date", "type": "date", "label": "Date setup completed", "required": true },
        { "key": "setup_by", "type": "short_text", "label": "Completed by", "required": true },
        {
          "key": "funding_source",
          "type": "radio",
          "label": "Care package funded by",
          "required": true,
          "options": [
            { "label": "Local Authority", "value": "local_authority" },
            { "label": "NHS", "value": "nhs" },
            { "label": "Private", "value": "private" }
          ]
        },
        {
          "key": "care_plan_in_place",
          "type": "radio",
          "label": "Care plan in place",
          "required": true,
          "options": [
            { "label": "Yes", "value": "yes" },
            { "label": "No", "value": "no" }
          ]
        },
        { "key": "notes", "type": "long_text", "label": "Notes" },
        { "key": "signature", "type": "signature", "label": "Signature" }
      ]
    }
  ]
}
$json$;
  n_evidence int;
  n_templates int;
  n_versions int;
begin
  select count(*) into n_evidence
  from public.evidence e join public.forms f on f.id = e.form_id
  where f.key = 'setup';

  if n_evidence > 0 then
    raise exception
      'Refusing to edit v1: % Evidence records exist against the Setup form. Publish a new version instead, so a completed record keeps the form it was completed on.',
      n_evidence;
  end if;

  update public.form_templates
     set schema = new_schema, updated_at = now()
   where key = 'setup';
  get diagnostics n_templates = row_count;

  update public.form_versions fv
     set schema = new_schema
    from public.forms f
   where f.id = fv.form_id
     and f.key = 'setup'
     and fv.version = f.current_version;
  get diagnostics n_versions = row_count;

  raise notice 'Rewrote % founder template(s) and % company form version(s).', n_templates, n_versions;
end $$;
